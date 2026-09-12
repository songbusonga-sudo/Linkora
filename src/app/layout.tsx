import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Linkora · 把心意，放在一起",
  description: "属于你的三码收款卡。选择模板，轻松制作，高清下载。",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
