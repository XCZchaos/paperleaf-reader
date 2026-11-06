'use client';
import {useEffect,useState} from 'react';
import {ArrowLeft,ArrowUpRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {desktopBridge} from '@/lib/desktop';

export default function LibraryLink(){
 const [desktop,setDesktop]=useState(false);
 useEffect(()=>setDesktop(!!desktopBridge()),[]);
 return <Button asChild variant="outline" size="lg" className="desktop-library-return">{desktop?<a href="/"><ArrowLeft data-icon="inline-start"/>返回我的文献库</a>:<a href="https://github.com/XCZchaos/paperleaf-reader" target="_blank" rel="noreferrer">查看项目源码<ArrowUpRight data-icon="inline-end"/></a>}</Button>;
}
