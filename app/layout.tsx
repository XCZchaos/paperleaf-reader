import type { Metadata } from 'next';
import './globals.css';
import './refinements.css';
export const metadata:Metadata={title:'Paperleaf · 文献阅读工作台',description:'阅读、记录、连接想法。属于你的个人文献阅读空间。',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
