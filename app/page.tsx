'use client';

import dynamic from 'next/dynamic';

const Dashboard = dynamic(() => import('./dashboard'), {
  ssr: false,
  loading: () => <div style={{minHeight:'100vh',background:'#f6f8f7'}} aria-label="正在加载云邮盒" />,
});

export default function Page() {
  return <Dashboard />;
}
