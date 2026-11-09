export type DevicePasscode = {
  version: 1;
  actor: string;
  salt: string;
  verifier: string;
  failures: number;
  retryAt: number;
  credential?: { id: string; key: string; counter: number };
};
export const deviceUnlockAvailable = () =>
  window.isSecureContext &&
  !!window.PublicKeyCredential &&
  (location.hostname === 'localhost' ||
    (!/^\d+(\.\d+){3}$/.test(location.hostname) && !location.hostname.includes(':')));
const key = (actor: string) => 'little-days:device-lock:' + actor;
export const encode64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
export const decode64 = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
export function readPasscode(actor: string): DevicePasscode | null {
  const raw = localStorage.getItem(key(actor));
  if (!raw) return null;
  const data = JSON.parse(raw) as DevicePasscode;
  if (
    data.version !== 1 ||
    data.actor !== actor ||
    !/^[\w-]{22}$/.test(data.salt) ||
    !/^[\w-]{43}$/.test(data.verifier)
  )
    throw Error('Cấu hình khóa bị hỏng. Đăng nhập lại bằng mật khẩu để đặt lại.');
  return data;
}
export function writePasscode(actor: string, value: DevicePasscode | null) {
  if (value) localStorage.setItem(key(actor), JSON.stringify(value));
  else localStorage.removeItem(key(actor));
  window.dispatchEvent(new CustomEvent('little-days:passcode', { detail: actor }));
}
async function derive(pin: string, salt: string) {
  if (!/^\d{4}$/.test(pin)) throw Error('Nhập mã PIN gồm 4 chữ số.');
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return encode64(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: decode64(salt), iterations: 600000 },
        material,
        256,
      ),
    ),
  );
}
export async function createPasscode(actor: string, pin: string): Promise<DevicePasscode> {
  const salt = encode64(crypto.getRandomValues(new Uint8Array(16)));
  return { version: 1, actor, salt, verifier: await derive(pin, salt), failures: 0, retryAt: 0 };
}
export async function checkPasscode(actor: string, pin: string) {
  const value = readPasscode(actor);
  if (!value) throw Error('Khóa trên thiết bị đã thay đổi. Mở lại ứng dụng.');
  if (value.retryAt > Date.now())
    throw Error(
      'Đã nhập sai nhiều lần. Thử lại sau ' +
        Math.ceil((value.retryAt - Date.now()) / 1000) +
        ' giây.',
    );
  const matches = (await derive(pin, value.salt)) === value.verifier;
  const latest = readPasscode(actor);
  if (latest?.verifier !== value.verifier) throw Error('Mã khóa vừa thay đổi. Hãy thử lại.');
  latest.failures = matches ? 0 : Math.min(20, (latest.failures || 0) + 1);
  latest.retryAt =
    !matches && latest.failures >= 5
      ? Date.now() + Math.min(900000, 30000 * 2 ** (latest.failures - 5))
      : 0;
  // Verification updates throttling only; do not signal a lock configuration change.
  localStorage.setItem(key(actor), JSON.stringify(latest));
  if (!matches) throw Error('Mã PIN chưa đúng.');
  return latest;
}
const json = (data: ArrayBuffer) => JSON.parse(new TextDecoder().decode(data));
function validateClient(data: ArrayBuffer, type: string, challenge: Uint8Array) {
  const client = json(data);
  if (
    client.type !== type ||
    client.challenge !== encode64(challenge) ||
    client.origin !== location.origin ||
    client.crossOrigin === true
  )
    throw Error('Xác thực thiết bị không hợp lệ.');
}
async function validateAuthenticator(bytes: ArrayBuffer) {
  const auth = new Uint8Array(bytes),
    rp = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(location.hostname)),
    );
  if (auth.length < 37 || !rp.every((b, i) => auth[i] === b) || (auth[32] & 5) !== 5)
    throw Error('Thiết bị chưa xác minh chủ sở hữu.');
  return new DataView(bytes).getUint32(33);
}
export async function enrollDevice(actor: string) {
  const value = readPasscode(actor);
  if (!value) throw Error('Bật mã PIN trước khi thêm mở khóa thiết bị.');
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Little Days', id: location.hostname },
      user: {
        id: new TextEncoder().encode(actor),
        name: 'Little Days trên thiết bị này',
        displayName: 'Little Days',
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      attestation: 'none',
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw Error('Chưa tạo được mở khóa thiết bị.');
  const response = credential.response as AuthenticatorAttestationResponse;
  validateClient(response.clientDataJSON, 'webauthn.create', challenge);
  const publicKey = response.getPublicKey?.();
  if (!publicKey || response.getPublicKeyAlgorithm?.() !== -7 || !response.getAuthenticatorData)
    throw Error('Trình duyệt chưa hỗ trợ cách mở khóa này. Tiếp tục dùng PIN.');
  const counter = await validateAuthenticator(response.getAuthenticatorData());
  const latest = readPasscode(actor);
  if (latest?.verifier !== value.verifier || latest.credential?.key !== value.credential?.key)
    throw Error('Cài đặt khóa vừa thay đổi. Hãy thử lại.');
  writePasscode(actor, {
    ...latest,
    credential: { id: credential.id, key: encode64(new Uint8Array(publicKey)), counter },
  });
}
/** WebCrypto ECDSA expects the fixed-size r||s signature, WebAuthn returns ASN.1 DER. */
export function assertionSignature(der: Uint8Array) {
  if (der.length < 8 || der[0] !== 0x30 || der[1] !== der.length - 2 || der[2] !== 2)
    throw Error('Chữ ký thiết bị không hợp lệ.');
  const rLength = der[3],
    next = 4 + rLength;
  if (der[next] !== 2 || next + 2 + der[next + 1] !== der.length)
    throw Error('Chữ ký thiết bị không hợp lệ.');
  const result = new Uint8Array(64);
  for (const [part, offset] of [
    [der.slice(4, next), 0],
    [der.slice(next + 2), 32],
  ] as const) {
    const bytes = part.length === 33 && part[0] === 0 ? part.slice(1) : part;
    if (bytes.length > 32 || !bytes.length) throw Error('Chữ ký thiết bị không hợp lệ.');
    result.set(bytes, offset + 32 - bytes.length);
  }
  return result;
}
export async function unlockDevice(actor: string) {
  const value = readPasscode(actor),
    device = value?.credential;
  if (!value || !device) throw Error('Thiết bị chưa đăng ký mở khóa nhanh.');
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const result = (await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: decode64(device.id) }],
      userVerification: 'required',
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!result || result.id !== device.id) throw Error('Chưa mở khóa thiết bị.');
  const response = result.response as AuthenticatorAssertionResponse;
  validateClient(response.clientDataJSON, 'webauthn.get', challenge);
  const counter = await validateAuthenticator(response.authenticatorData);
  if (device.counter && counter && counter <= device.counter)
    throw Error('Xác thực thiết bị đã cũ. Dùng PIN để tiếp tục.');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', response.clientDataJSON)),
    auth = new Uint8Array(response.authenticatorData),
    signed = new Uint8Array(auth.length + digest.length);
  signed.set(auth);
  signed.set(digest, auth.length);
  const publicKey = await crypto.subtle.importKey(
    'spki',
    decode64(device.key),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  if (
    !(await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      assertionSignature(new Uint8Array(response.signature)),
      signed,
    ))
  )
    throw Error('Chữ ký thiết bị không hợp lệ.');
  const latest = readPasscode(actor);
  if (
    latest?.verifier !== value.verifier ||
    latest.credential?.id !== device.id ||
    latest.credential?.key !== device.key ||
    latest.credential?.counter !== device.counter
  )
    throw Error('Cài đặt khóa vừa thay đổi. Hãy thử lại.');
  localStorage.setItem(
    key(actor),
    JSON.stringify({ ...latest, credential: { ...device, counter }, failures: 0, retryAt: 0 }),
  );
}
