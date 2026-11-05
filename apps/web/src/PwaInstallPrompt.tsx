import { Modal } from './Modal.js';
import { useEffect, useState } from 'react';
import { Smartphone, Download, X, Share, PlusSquare, Sparkles } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIos(isAppleDevice);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      try {
        localStorage.removeItem('pwa_banner_dismissed');
      } catch {}
    };

    const consumed = () => setDeferredPrompt(null);
    window.addEventListener('little-days:install-consumed', consumed);
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('little-days:install-consumed', consumed);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = async (onIosGuide?: () => void) => {
    if (deferredPrompt) {
      window.dispatchEvent(new Event('little-days:install-consumed'));
      try {
        await deferredPrompt.prompt();
        return (await deferredPrompt.userChoice).outcome;
      } catch {
        onIosGuide?.();
        return 'guide';
      }
    }
    if (!isInstalled && onIosGuide) {
      onIosGuide();
      return 'guide';
    }

    return null;
  };

  return {
    canInstall: !isInstalled && (!!deferredPrompt || isIos),
    hasPrompt: !!deferredPrompt,
    isInstalled,
    isIos,
    triggerInstall,
  };
}

export function IosInstallDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Cài Little Days trên màn hình chính" onClose={onClose}>
      <div className="pwa-ios-steps">
        <p>Trên iPhone/iPad: mở bằng Safari → Chia sẻ → Thêm vào Màn hình chính → Thêm.</p>
        <p>
          Trên Android: mở bằng Chrome → menu ⋮ → Cài đặt ứng dụng hoặc Thêm vào màn hình chính.
        </p>
        <p>
          Trên máy tính: mở bằng Chrome/Edge → menu → Cài đặt Little Days. Nếu trình duyệt chưa hiện
          tùy chọn, hãy mở trang bằng trình duyệt chính và thử lại.
        </p>
        <small>
          Ứng dụng vẫn cần mạng để đọc dữ liệu riêng tư. Cài đặt không tự bật thông báo đẩy.
        </small>
      </div>
    </Modal>
  );
}

export function PwaInstallBanner() {
  const { canInstall, triggerInstall, isInstalled } = usePwaInstall();
  const [dismissed, setDismissed] = useState(true);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    try {
      const dismissedTime = localStorage.getItem('pwa_banner_dismissed');
      // If dismissed more than 3 days ago, show again
      if (dismissedTime && Date.now() - Number(dismissedTime) < 3 * 86400000) {
        setDismissed(true);
      } else {
        setDismissed(false);
      }
    } catch {
      setDismissed(false);
    }
  }, []);

  if (isInstalled || !canInstall || dismissed) {
    return showIosGuide ? <IosInstallDialog onClose={() => setShowIosGuide(false)} /> : null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem('pwa_banner_dismissed', Date.now().toString());
    } catch {}
  };

  const handleInstallClick = () => {
    triggerInstall(() => setShowIosGuide(true));
  };

  return (
    <>
      <div className="pwa-install-banner" role="region" aria-label="Cài đặt ứng dụng">
        <div className="pwa-banner-content">
          <div className="pwa-banner-icon">
            <Smartphone size={20} />
          </div>
          <div className="pwa-banner-text">
            <strong>Cài Little Days vào màn hình chính</strong>
            <p>Mở xem kỉ niệm mượt mà toàn màn hình, không cần qua trình duyệt ♡</p>
          </div>
        </div>
        <div className="pwa-banner-actions">
          <button className="button primary tiny-action" onClick={handleInstallClick}>
            <Download size={14} /> Cài đặt ngay
          </button>
          <button
            className="icon-button tiny pwa-close-btn"
            onClick={handleDismiss}
            aria-label="Để sau"
            title="Để sau"
          >
            <X size={15} />
          </button>
        </div>
      </div>
      {showIosGuide && <IosInstallDialog onClose={() => setShowIosGuide(false)} />}
    </>
  );
}

export function PwaHeaderButton() {
  const { canInstall, isInstalled, triggerInstall } = usePwaInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);

  if (isInstalled || !canInstall) return null;

  return (
    <>
      <button
        className="icon-button pwa-header-button"
        aria-label="Cài đặt ứng dụng lên màn hình chính"
        title="Cài đặt ứng dụng Little Days"
        onClick={() => triggerInstall(() => setShowIosGuide(true))}
      >
        <Smartphone size={18} />
      </button>
      {showIosGuide && <IosInstallDialog onClose={() => setShowIosGuide(false)} />}
    </>
  );
}

export function PwaSidebarButton() {
  const { canInstall, isInstalled, triggerInstall } = usePwaInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);

  if (isInstalled || !canInstall) return null;

  return (
    <>
      <button
        className="nav-item pwa-sidebar-item"
        onClick={() => triggerInstall(() => setShowIosGuide(true))}
      >
        <Smartphone size={18} />
        <span className="nav-label">Cài ứng dụng</span>
      </button>
      {showIosGuide && <IosInstallDialog onClose={() => setShowIosGuide(false)} />}
    </>
  );
}

export function PwaAccountCard() {
  const { isInstalled, triggerInstall } = usePwaInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);

  return (
    <div className="pwa-account-card">
      <div className="pwa-account-header">
        <div className="pwa-account-icon">
          <Smartphone size={20} />
        </div>
        <div>
          <strong>Ứng dụng trên điện thoại</strong>
          <p className="muted small">
            {isInstalled
              ? 'Ứng dụng đã được cài đặt và sẵn sàng mở toàn màn hình.'
              : 'Cài đặt Little Days lên màn hình chính để mở xem kỉ niệm nhanh mỗi ngày.'}
          </p>
        </div>
      </div>
      <div className="pwa-account-action">
        {isInstalled ? (
          <span className="pwa-installed-tag">✓ Đã cài đặt trên thiết bị</span>
        ) : (
          <button
            type="button"
            className="button quiet small"
            onClick={() => triggerInstall(() => setShowIosGuide(true))}
          >
            <Download size={14} /> Cài đặt ứng dụng
          </button>
        )}
      </div>
      {showIosGuide && <IosInstallDialog onClose={() => setShowIosGuide(false)} />}
    </div>
  );
}
