import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Linkora",
  description: "属于你的三码收款卡。选择模板，轻松制作，高清下载。",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link
          rel="preload"
          as="image"
          href="/private-assets/template-preview.webp"
          type="image/webp"
          fetchPriority="high"
        />
      </head>
      <body>
        {children}
        <footer className="site-record">
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noreferrer"
          >
            桂ICP备2026020596号
          </a>
        </footer>
      </body>
    </html>
  );
}
