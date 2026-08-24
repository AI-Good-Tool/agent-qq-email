'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { App, Avatar, Badge, Button, ConfigProvider, Dropdown, Empty, Input, Layout, Menu, Modal, Result, Select, Space, Spin, Table, Tag, Tooltip } from 'antd';
import type { MenuProps, TableColumnsType } from 'antd';
import BellOutlined from '@ant-design/icons/BellOutlined';
import CheckCircleFilled from '@ant-design/icons/CheckCircleFilled';
import DownOutlined from '@ant-design/icons/DownOutlined';
import InboxOutlined from '@ant-design/icons/InboxOutlined';
import MailOutlined from '@ant-design/icons/MailOutlined';
import MoreOutlined from '@ant-design/icons/MoreOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import QrcodeOutlined from '@ant-design/icons/QrcodeOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import SendOutlined from '@ant-design/icons/SendOutlined';
import SettingOutlined from '@ant-design/icons/SettingOutlined';
import StarFilled from '@ant-design/icons/StarFilled';
import StarOutlined from '@ant-design/icons/StarOutlined';
import TeamOutlined from '@ant-design/icons/TeamOutlined';
import UserOutlined from '@ant-design/icons/UserOutlined';
import WechatFilled from '@ant-design/icons/WechatFilled';
import { QRCodeSVG } from 'qrcode.react';

const { Header, Sider, Content } = Layout;
type Account = { id:string; name:string; email:string|null; unread:number; color:string; initials:string; status:string };
type MailItem = { id:string; sender:string; senderInitial:string; senderColor:string; subject:string; preview:string; accountId:string; category:'工作'|'订阅'|'账单'|'通知'; time:string; unread:boolean; starred:boolean };
type Stats = { total:number; unread:number; accounts:number; today:number };
type QrState = { status:'idle'|'loading'|'ready'|'success'|'config_error'|'error'; qrUrl?:string; sessionId?:string; message?:string };

const categoryColors:Record<string,string>={工作:'blue',订阅:'purple',账单:'orange',通知:'cyan'};
const senderColors=['#5d78d6','#9b68c6','#d85858','#2e9e89','#b77d42'];

function formatTime(value:number) {
  const date=new Date(value); const now=new Date();
  if(date.toDateString()===now.toDateString()) return new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
  return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric'}).format(date);
}

function MailDashboard(){
  const isClient=useSyncExternalStore(()=>()=>{},()=>true,()=>false);
  const {message}=App.useApp();
  const [accountFilter,setAccountFilter]=useState('all');
  const [category,setCategory]=useState('all');
  const [status,setStatus]=useState('all');
  const [search,setSearch]=useState('');
  const [qrOpen,setQrOpen]=useState(false);
  const [loading,setLoading]=useState(true);
  const [accountRows,setAccountRows]=useState<Account[]>([]);
  const [mailRows,setMailRows]=useState<MailItem[]>([]);
  const [stats,setStats]=useState<Stats>({total:0,unread:0,accounts:0,today:0});
  const [qr,setQr]=useState<QrState>({status:'idle'});

  const loadDashboard=useCallback(async()=>{
    try{
      const response=await fetch('/api/dashboard',{cache:'no-store'});
      if(!response.ok) throw new Error('dashboard request failed');
      const data=await response.json();
      setAccountRows(data.accounts.map((item:{id:string;name:string;email:string|null;unread:number;color:string;status:string})=>({...item,unread:Number(item.unread),initials:item.name.slice(0,1)})));
      setMailRows(data.emails.map((item:{id:string;sender:string;subject:string;preview:string;accountId:string;category:MailItem['category'];receivedAt:number;isRead:number;isStarred:number},index:number)=>({...item,senderInitial:item.sender.slice(0,1),senderColor:senderColors[index%senderColors.length],time:formatTime(item.receivedAt),unread:!Boolean(item.isRead),starred:Boolean(item.isStarred)})));
      setStats({total:Number(data.stats?.total??0),unread:Number(data.stats?.unread??0),accounts:Number(data.stats?.accounts??0),today:Number(data.stats?.today??0)});
    }catch{message.error('无法读取邮箱数据，请稍后重试。')}finally{setLoading(false)}
  },[message]);

  const openQr=()=>{setQr({status:'loading'});setQrOpen(true)};
  const closeQr=()=>{setQrOpen(false);setQr({status:'idle'})};
  useEffect(()=>{const timer=window.setTimeout(()=>void loadDashboard(),0);return()=>window.clearTimeout(timer)},[loadDashboard]);
  useEffect(()=>{
    if(!qrOpen)return;
    const controller=new AbortController();
    fetch('/api/wechat/qr',{method:'POST',signal:controller.signal}).then(async response=>{
      const data=await response.json();
      if(!response.ok){setQr({status:data.code?.startsWith('AGENT_MAIL_BACKEND_')?'config_error':'error',message:data.message});return}
      setQr({status:'ready',qrUrl:data.authUrl,sessionId:data.sessionId});
    }).catch(error=>{if(error.name!=='AbortError')setQr({status:'error',message:'无法创建扫码会话，请稍后重试。'})});
    return()=>controller.abort();
  },[qrOpen]);
  useEffect(()=>{
    if(qr.status!=='ready'||!qr.sessionId)return;
    const timer=window.setInterval(()=>fetch(`/api/wechat/qr?sessionId=${encodeURIComponent(qr.sessionId!)}`,{cache:'no-store'}).then(r=>r.json()).then(data=>{
      if(data.status==='confirmed'){window.clearInterval(timer);setQr({status:'success'});void loadDashboard();window.setTimeout(()=>setQrOpen(false),1200)}
      if(data.status==='expired'){window.clearInterval(timer);setQr({status:'error',message:'二维码已过期，请关闭后重新打开。'})}
      if(data.status==='failed'){window.clearInterval(timer);setQr({status:'error',message:data.message||'官方登录程序已退出，请重新尝试。'})}
    }).catch(()=>undefined),1500);
    return()=>window.clearInterval(timer);
  },[qr.status,qr.sessionId,loadDashboard]);

  const filtered=useMemo(()=>mailRows.filter(mail=>{const q=search.trim().toLowerCase();return(accountFilter==='all'||mail.accountId===accountFilter)&&(category==='all'||mail.category===category)&&(status==='all'||(status==='unread'?mail.unread:mail.starred))&&(!q||`${mail.sender}${mail.subject}${mail.preview}`.toLowerCase().includes(q))}),[accountFilter,category,status,search,mailRows]);
  if(!isClient)return <div style={{minHeight:'100vh',background:'#f6f8f7'}} aria-label="正在加载云邮盒"/>;
  const columns:TableColumnsType<MailItem>=[
    {title:'发件人',dataIndex:'sender',width:180,render:(_,row)=><div className="sender-cell"><Avatar size={30} style={{background:row.senderColor,fontSize:12}}>{row.senderInitial}</Avatar><span className="sender">{row.sender}</span></div>},
    {title:'主题与摘要',dataIndex:'subject',render:(_,row)=><div className="subject-line"><span className="subject">{row.subject}</span><span className="preview">— {row.preview}</span></div>},
    {title:'类型',dataIndex:'category',width:82,render:value=><Tag color={categoryColors[value]} variant="filled">{value}</Tag>},
    {title:'微信账号',dataIndex:'accountId',width:150,render:value=>{const item=accountRows.find(a=>a.id===value);return item?<Tag className="wechat-tag" style={{background:`${item.color}13`,color:item.color}}><span className="tag-dot" style={{background:item.color}}/>{item.name}</Tag>:<span>—</span>}},
    {title:'时间',dataIndex:'time',width:82,render:value=><span style={{color:'#929995',fontSize:11}}>{value}</span>},
    {title:'',key:'actions',width:76,render:(_,row)=><Space size={4}><Tooltip title={row.starred?'取消星标':'添加星标'}><Button type="text" size="small" icon={row.starred?<StarFilled style={{color:'#f4aa28'}}/>:<StarOutlined/>}/></Tooltip><Button type="text" size="small" icon={<MoreOutlined/>}/></Space>},
  ];
  const accountMenu:MenuProps['items']=accountRows.map(item=>({key:item.id,label:item.name}));

  return <div className="mail-app"><Layout className="mail-shell">
    <Sider width={236} className="mail-sider"><div className="brand"><span className="brand-mark"><MailOutlined/></span><span className="brand-name">云邮盒</span></div>
      <Menu className="nav-menu" mode="inline" selectedKeys={['inbox']} items={[{key:'inbox',icon:<InboxOutlined/>,label:<span>统一收件箱 {stats.unread>0&&<Badge count={stats.unread} color="#17b26a" size="small" style={{marginLeft:26}}/>}</span>},{key:'starred',icon:<StarOutlined/>,label:'星标邮件'},{key:'sent',icon:<SendOutlined/>,label:'已发送'},{key:'contacts',icon:<TeamOutlined/>,label:'联系人'}]}/>
      <div className="sider-label">微信账号</div><div className="account-list">{accountRows.map(item=><div key={item.id} className={`account-chip ${accountFilter===item.id?'active':''}`} onClick={()=>setAccountFilter(item.id)}><Badge dot status={item.status==='online'?'success':'default'}><Avatar size={32} style={{background:item.color,fontSize:12}}>{item.initials}</Avatar></Badge><div style={{minWidth:0}}><div className="account-name">{item.name}</div><div className="account-email">{item.email||'未绑定邮箱'}</div></div>{item.unread>0&&<span className="account-count">{item.unread}</span>}</div>)}</div>
      <div className="add-account" onClick={openQr}><PlusOutlined/>&nbsp; 扫码添加微信</div><div className="side-footer"><SettingOutlined/>&nbsp; 设置与数据同步</div>
    </Sider>
    <Layout className="main-layout"><Header className="topbar"><div><div className="breadcrumb-title">收件箱</div><div className="breadcrumb-sub">{stats.accounts?`${stats.accounts} 个微信账号`:'尚未连接微信'} · 数据已加密存储</div></div><div className="header-actions"><Input className="global-search" allowClear value={search} onChange={e=>setSearch(e.target.value)} prefix={<SearchOutlined style={{color:'#a4aba7'}}/>} placeholder="搜索发件人、主题或正文"/><Tooltip title="通知"><Button shape="circle" icon={<BellOutlined/>}/></Tooltip><div className="user-pill"><Avatar size={31} style={{background:'#20332a'}} icon={<UserOutlined/>}/><span style={{fontSize:12,fontWeight:650}}>管理台</span><DownOutlined style={{fontSize:9,color:'#999'}}/></div></div></Header>
      <Content className="main-content"><div className="hero-row"><div><h1>统一收件箱</h1><p>{stats.accounts?'查看所有已连接账号的真实邮件。':'连接微信账号，然后绑定邮箱开始同步。'}</p></div><Button type="primary" icon={<QrcodeOutlined/>} onClick={openQr}>添加微信账号</Button></div>
        <div className="stat-row"><div className="stat-card"><div className="stat-label">全部邮件</div><div className="stat-value">{stats.total}</div></div><div className="stat-card"><div className="stat-label">未读邮件</div><div className="stat-value">{stats.unread}</div></div><div className="stat-card"><div className="stat-label">已连接微信</div><div className="stat-value">{stats.accounts}</div></div><div className="stat-card"><div className="stat-label">今日邮件</div><div className="stat-value">{stats.today}</div></div></div>
        <section className="mail-card"><div className="toolbar"><div className="filter-group"><Select className="filter-select" value={accountFilter} onChange={setAccountFilter} options={[{value:'all',label:'全部微信账号'},...accountRows.map(a=>({value:a.id,label:a.name}))]}/><Select value={category} onChange={setCategory} options={[{value:'all',label:'全部类型'},{value:'工作',label:'工作'},{value:'订阅',label:'订阅'},{value:'账单',label:'账单'},{value:'通知',label:'通知'}]}/><Select value={status} onChange={setStatus} options={[{value:'all',label:'全部状态'},{value:'unread',label:'仅未读'},{value:'starred',label:'仅星标'}]}/><span style={{fontSize:11,color:'#9ba19e'}}>共 {filtered.length} 封</span></div><Space><Tooltip title="刷新数据"><Button loading={loading} icon={<ReloadOutlined/>} onClick={()=>void loadDashboard()}/></Tooltip><Dropdown disabled={!accountRows.length} menu={{items:accountMenu}}><Button>批量操作 <DownOutlined/></Button></Dropdown></Space></div><Table className="mail-table" rowKey="id" rowSelection={mailRows.length?{}:undefined} columns={columns} dataSource={filtered} loading={loading} locale={{emptyText:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span>还没有真实邮件<br/><small>连接微信并完成邮箱授权后，邮件会显示在这里</small></span>}/>}} pagination={filtered.length>7?{pageSize:7,showSizeChanger:false,placement:'bottomRight'}:false} rowClassName={row=>row.unread?'unread-row':''} scroll={{x:860}}/></section>
      </Content></Layout>
  </Layout>
  <Modal className="qr-modal" open={qrOpen} onCancel={closeQr} footer={null} width={420} centered destroyOnHidden><div className="qr-modal-head"><h2><WechatFilled style={{color:'#17b26a',marginRight:9}}/>连接新的微信账号</h2><p>使用微信扫码完成 Agent Mail 官方设备授权。</p></div><div className="qr-body">
    {qr.status==='loading'&&<div className="qr-loading"><Spin size="large"/><p>正在启动 Agent Mail 官方登录…</p></div>}
    {qr.status==='ready'&&qr.qrUrl&&<><div className="qr-frame"><QRCodeSVG value={qr.qrUrl} size={172} level="H"/><div className="qr-logo"><WechatFilled/></div></div><div className="qr-status"><Badge status="processing"/> 等待微信扫码</div><div className="qr-help">二维码将在 5 分钟后失效</div><div className="security-note"><CheckCircleFilled style={{color:'#16a765'}}/> 授权凭据由官方 CLI 安全保存在系统钥匙串。</div></>}
    {qr.status==='success'&&<Result status="success" title="微信连接成功" subTitle="正在刷新账号列表…"/>}
    {qr.status==='config_error'&&<Result status="warning" title="Agent Mail 服务尚未连接" subTitle="请先启动本机 Egg.js 服务。它会直接调用官方 agently-cli，不需要 AppID 或 AppSecret。"/>}
    {qr.status==='error'&&<Result status="error" title="无法创建微信连接" subTitle={qr.message||'请稍后重试。'} extra={<Button onClick={()=>{closeQr();window.setTimeout(openQr,0)}}>重新尝试</Button>}/>}
  </div></Modal>
  </div>;
}

export default function Home(){return <ConfigProvider theme={{token:{colorPrimary:'#17b26a',borderRadius:9,colorText:'#26302b',colorBorder:'#e7ece9',fontSize:13},components:{Button:{primaryShadow:'none'},Table:{headerBg:'#fbfcfb'}}}}><App><MailDashboard/></App></ConfigProvider>}
