const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

type Content = {
  eyebrow: string;
  title: string;
  paragraphs: string[];
  action: string;
  url: string;
  note: string;
};
export function mailContent(content: Content): { text: string; html: string } {
  const url = new URL(content.url);
  if (
    url.username ||
    url.password ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
  )
    throw Error('Invalid mail action URL');
  const { title, paragraphs, action, note, eyebrow } = content;
  const href = escape(url.href);
  return {
    text: `${title}\n\n${paragraphs.join('\n\n')}\n\n${action}:\n${url.href}\n\n${note}\n\nLittle Days · Giữ lại những ngày thương.`,
    html: `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(title)}</title><style>@media(max-width:480px){.mail-outer{padding:16px 8px!important}.mail-content{padding:28px 20px!important}.mail-title{font-size:25px!important}}</style></head>
<body style="margin:0;padding:0;background:#f5f2e9;color:#454b3c;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escape(paragraphs[0] || title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f2e9"><tr><td class="mail-outer" align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="padding:0 12px 24px;text-align:center;font-family:Georgia,serif;font-size:30px;color:#586a43">little days <span style="color:#a06d62">♡</span></td></tr>
<tr><td class="mail-content" bgcolor="#fffdf7" style="padding:38px 36px;border:1px solid #e2dfd0;border-top:5px solid #87956f;border-radius:16px">
<p style="margin:0 0 14px;font-size:11px;letter-spacing:1.5px;color:#886f54">${escape(eyebrow)}</p>
<h1 class="mail-title" style="font-family:Georgia,serif;font-size:29px;line-height:1.3;font-weight:400;color:#414e35;margin:0 0 22px">${escape(title)}</h1>
${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.8;margin:0 0 16px;color:#55594c">${escape(p)}</p>`).join('')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0"><tr><td bgcolor="#65764f" style="border-radius:10px;text-align:center"><a href="${href}" style="display:inline-block;padding:15px 24px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;line-height:1.4">${escape(action)}</a></td></tr></table>
<p style="padding:16px;background:#f1f3e8;border-radius:10px;font-size:13px;line-height:1.7;color:#5c654f;margin:0 0 24px">${escape(note)}</p>
<p style="font-size:12px;line-height:1.6;color:#797c70;margin:0 0 6px">Nếu nút không mở được, sao chép liên kết này vào trình duyệt:</p>
<p style="font-size:12px;line-height:1.7;word-break:break-all;overflow-wrap:anywhere;margin:0"><a href="${href}" style="color:#65764f">${href}</a></p>
</td></tr><tr><td style="padding:24px 16px;text-align:center;color:#787a6c;font-size:12px;line-height:1.8">Giữ lại những ngày thương.<br>Little Days · Thư tự động từ ứng dụng</td></tr></table></td></tr></table></body></html>`,
  };
}

export function authMail(purpose: 'verify-email' | 'reset-password', url: string) {
  return mailContent(
    purpose === 'verify-email'
      ? {
          eyebrow: 'CHÀO MỪNG ĐẾN GÓC NHỎ CỦA BẠN',
          title: 'Một bước nhỏ để giữ những ngày thương',
          paragraphs: [
            'Cảm ơn bạn đã đến với Little Days. Xác minh địa chỉ email để bảo vệ tài khoản và cùng người thương xây dựng không gian kỉ niệm.',
          ],
          action: 'Xác minh email',
          url,
          note: 'Liên kết có hiệu lực 24 giờ. Nếu bạn không tạo tài khoản này, hãy bỏ qua thư; không chia sẻ liên kết cho người khác.',
        }
      : {
          eyebrow: 'CHĂM CHÚT CHO GÓC RIÊNG',
          title: 'Đặt lại mật khẩu của bạn',
          paragraphs: [
            'Little Days nhận được yêu cầu đặt lại mật khẩu. Bấm nút bên dưới để chọn mật khẩu mới và trở lại với những kỉ niệm của bạn.',
          ],
          action: 'Chọn mật khẩu mới',
          url,
          note: 'Liên kết có hiệu lực 15 phút và chỉ dùng một lần. Nếu không yêu cầu thao tác này, bạn có thể bỏ qua; mật khẩu hiện tại chưa thay đổi.',
        },
  );
}
