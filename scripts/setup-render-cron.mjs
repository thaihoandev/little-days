import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const payload = JSON.parse(
  await readFile(new URL('../deploy/render-keepalive.cron-job.json', import.meta.url), 'utf8'),
);
export const cronConfiguration = () => structuredClone(payload);
const endpoint = 'https://api.cron-job.org';

export async function configureRenderCron({ key, statusOnly = false, request = fetch }) {
  if (!key?.trim() || /[\r\n]/.test(key))
    throw Error('Đặt CRON_JOB_API_KEY trong terminal; không gửi key vào chat hoặc commit.');
  async function call(path, method = 'GET', body) {
    let response;
    try {
      response = await request(endpoint + path, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        headers: { Authorization: 'Bearer ' + key.trim(), 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw Error(
        method === 'GET'
          ? 'Không đọc được cron-job.org. Thử lại khi kết nối ổn định.'
          : 'Chưa xác định kết quả ghi trên cron-job.org. Không tự retry; chạy lại lệnh để đối chiếu job trước.',
      );
    }
    if (!response.ok) throw Error('cron-job.org trả HTTP ' + response.status + '; không tự retry.');
    try {
      return await response.json();
    } catch {
      throw Error(
        'Phản hồi cron-job.org không hợp lệ; kiểm tra job trong dashboard trước khi chạy lại.',
      );
    }
  }
  const config = cronConfiguration(),
    { job } = config;
  const listed = await call('/jobs');
  if (listed.someFailed !== false || !Array.isArray(listed.jobs))
    throw Error('Danh sách job chưa đầy đủ; dừng để tránh tạo trùng.');
  const related = listed.jobs.filter((j) => j.title === job.title || j.url === job.url);
  if (related.length > 1 || related.some((j) => j.title !== job.title || j.url !== job.url))
    throw Error(
      'Đã có job trùng tên hoặc URL khác cấu hình. Kiểm tra dashboard trước khi tiếp tục.',
    );
  let id = related[0]?.jobId;
  if (id !== undefined && (!Number.isSafeInteger(id) || id < 1))
    throw Error('Job ID không hợp lệ.');
  if (statusOnly && id === undefined) throw Error('Chưa có job Little Days trong tài khoản này.');
  if (!statusOnly) {
    if (id === undefined) id = (await call('/jobs', 'PUT', config)).jobId;
    else await call('/jobs/' + id, 'PATCH', config);
  }
  if (!Number.isSafeInteger(id) || id < 1)
    throw Error('Không nhận được job ID hợp lệ. Kiểm tra dashboard.');
  const details = (await call('/jobs/' + id)).jobDetails;
  if (
    !details ||
    details.url !== job.url ||
    details.enabled !== true ||
    details.requestMethod !== 0 ||
    Object.entries(job.schedule).some(
      ([field, value]) => JSON.stringify(details.schedule?.[field]) !== JSON.stringify(value),
    )
  )
    throw Error('Job chưa khớp cấu hình chạy mỗi 5 phút. Kiểm tra dashboard.');
  // Never print job details: the account could contain authentication headers or passwords.
  const result = { jobId: id, enabled: true, intervalMinutes: 5, verifiedConfiguration: true };
  if (statusOnly) {
    const history = (await call('/jobs/' + id + '/history')).history;
    if (!Array.isArray(history)) throw Error('Không đọc được lịch sử job.');
    result.executions = history.slice(0, 3).map((h) => ({
      at: Number.isFinite(h.date) ? new Date(h.date * 1000).toISOString() : null,
      success: h.status === 1 && h.httpStatus === 200,
    }));
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv.slice(2);
  try {
    if (!mode.length || (mode.length === 1 && mode[0] === '--dry-run'))
      console.log(JSON.stringify(cronConfiguration(), null, 2));
    else if (mode.length === 1 && ['--apply', '--status'].includes(mode[0]))
      console.log(
        JSON.stringify(
          await configureRenderCron({
            key: process.env.CRON_JOB_API_KEY,
            statusOnly: mode[0] === '--status',
          }),
          null,
          2,
        ),
      );
    else throw Error('Dùng node scripts/setup-render-cron.mjs [--dry-run|--apply|--status].');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
