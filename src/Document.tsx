import type { ParentProps } from "solid-js";
import { HydrationScript } from "@solidjs/web";
import stickerUrl from "../assets/sticker.svg";

// The document shell (the index.html replacement), picked up by the
// src/Document.* convention; it must render the full <html> and ships no
// client JS. <HydrationScript /> is stripped from the prerendered shell in
// client mode and activates under `ssr: true`. Delete this file to fall
// back to the plugin's built-in shell.
export default function Document(props: ParentProps) {
  return (
    <html lang="vi">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#fcf8ed" />
        <meta
          name="description"
          content="Plasain giúp bạn tìm cảm hứng cho bữa ăn, lên thực đơn và theo dõi dinh dưỡng mỗi ngày — nhẹ nhàng, phù hợp với bạn."
        />
        <meta name="application-name" content="Plasain" />
        <meta name="apple-mobile-web-app-title" content="Plasain" />
        <meta name="color-scheme" content="light" />
        <meta property="og:locale" content="vi_VN" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Plasain" />
        <meta
          property="og:title"
          content="Plasain — Lên kế hoạch bữa ăn nhẹ nhàng"
        />
        <meta
          property="og:description"
          content="Tìm cảm hứng cho bữa ăn, lên thực đơn và theo dõi dinh dưỡng mỗi ngày cùng Plasain."
        />
        <meta property="og:image" content={stickerUrl} />
        <meta name="twitter:card" content="summary" />
        <meta
          name="twitter:title"
          content="Plasain — Lên kế hoạch bữa ăn nhẹ nhàng"
        />
        <meta
          name="twitter:description"
          content="Tìm cảm hứng cho bữa ăn, lên thực đơn và theo dõi dinh dưỡng mỗi ngày cùng Plasain."
        />
        <meta name="twitter:image" content={stickerUrl} />
        <link rel="icon" type="image/svg+xml" href={stickerUrl} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossorigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,600;0,700;1,400;1,700&family=Momo+Signature&display=swap"
          rel="stylesheet"
        />
        <title>Plasain — Lên kế hoạch bữa ăn nhẹ nhàng</title>
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
