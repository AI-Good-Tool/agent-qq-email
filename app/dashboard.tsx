'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { App, Avatar, Badge, Button, ConfigProvider, Dropdown, Empty, Input, Layout, Menu, Modal, Result, Select, Space, Spin, Table, Tag, Tooltip } from 'antd';
import type { MenuProps, TableColumnsType } from 'antd';
import BellOutlined from '@ant-design/icons/BellOutlined';
import ContactsOutlined from '@ant-design/icons/ContactsOutlined';
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

const { Header, Sider, Content } = Layout;
type Folder = 'inbox'|'sent';
type View = 'inbox'|'starred'|'sent'|'contacts';
type Account = { id:string; aliasId:string; workspace:string; connectionId:string; name:string; email:string; unread:number; color:string; initials:string; status:string };
type Connection = { id:string; name:string; aliasCount:number; unread:number; color:string; status:string; aliases:Account[] };
type MailItem = { id:string; messageId:string; workspace:string; connectionId:string; sender:string; senderAddress:string; senderInitial:string; senderColor:string; subject:string; preview:string; accountId:string; category:string; receivedAt:number; time:string; unread:boolean; starred:boolean };
type Stats = { total:number; unread:number; accounts:number; aliases:number; today:number };
type Contact = { name:string; email:string };
type QrState = { status:'idle'|'loading'|'ready'|'success'|'config_error'|'error'; authUrl?:string; sessionId?:string; message?:string };
type MailAddress = { name?:string; email:string };
type MailAttachment = { attachment_id?:string; filename:string; content_type?:string; size?:number; download_url?:string };
type MailDetail = { message_id:string; workspace:string; subject:string; body:string; body_format?:string; created_at:string; from?:MailAddress; to?:MailAddress[]; cc?:MailAddress[]; attachments?:MailAttachment[] };
type ComposeState = { open:boolean; action:'send'|'reply'; workspace:string; to:string; subject:string; body:string; messageId?:string; confirmationToken?:string; summary?:{from?:string;to?:string[];subject?:string}; sending:boolean; error?:string };

const senderColors = ['#5d78d6','#9b68c6','#d85858','#2e9e89','#b77d42'];
const emptyCompose:ComposeState = { open:false, action:'send', workspace:'', to:'', subject:'', body:'', sending:false };

function formatTime(value:number) {
  const date = new Date(value); const now = new Date();
  if (date.toDateString() === now.toDateString()) return new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
  return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric'}).format(date);
}
function messageBodyText(detail:MailDetail|null) {
  if (!detail?.body) return '（邮件正文为空）';
  if (detail.body_format?.toUpperCase() !== 'HTML') return detail.body;
  const document = new DOMParser().parseFromString(detail.body,'text/html');
  document.querySelectorAll('br').forEach(node=>node.replaceWith('\n'));
  document.querySelectorAll('p,div,li,tr').forEach(node=>node.append('\n'));
  return (document.body.textContent||'').replace(/\n{3,}/g,'\n\n').trim();
}
function addressText(address?:MailAddress) { return address ? [address.name,address.email&&`<${address.email}>`].filter(Boolean).join(' ') : '—'; }
function addressList(addresses?:MailAddress[]) { return addresses?.length ? addresses.map(addressText).join('、') : '—'; }
function fileSize(value?:number) { if (!value) return ''; if (value<1024) return `${value} B`; if (value<1024*1024) return `${(value/1024).toFixed(1)} KB`; return `${(value/1024/1024).toFixed(1)} MB`; }

function MailDashboard() {
  const isClient = useSyncExternalStore(()=>()=>{},()=>true,()=>false);
  const { message } = App.useApp();
  const [view,setView] = useState<View>('inbox');
  const [folder,setFolder] = useState<Folder>('inbox');
  const [accountFilter,setAccountFilter] = useState('all');
  const [category,setCategory] = useState('all');
  const [status,setStatus] = useState('all');
  const [search,setSearch] = useState('');
  const [loading,setLoading] = useState(true);
  const [connections,setConnections] = useState<Connection[]>([]);
  const [accountRows,setAccountRows] = useState<Account[]>([]);
  const [mailRows,setMailRows] = useState<MailItem[]>([]);
  const [contacts,setContacts] = useState<Contact[]>([]);
  const [stats,setStats] = useState<Stats>({total:0,unread:0,accounts:0,aliases:0,today:0});
  const [qrOpen,setQrOpen] = useState(false);
  const [qrTarget,setQrTarget] = useState<string|null>(null);
  const [qr,setQr] = useState<QrState>({status:'idle'});
  const [detailOpen,setDetailOpen] = useState(false);
  const [detailLoading,setDetailLoading] = useState(false);
  const [detail,setDetail] = useState<MailDetail|null>(null);
  const [detailError,setDetailError] = useState('');
  const [compose,setCompose] = useState<ComposeState>(emptyCompose);

  const loadDashboard = useCallback(async(targetFolder:Folder)=>{
    setLoading(true);
    try {
      const response = await fetch(`/api/dashboard?folder=${targetFolder}`,{cache:'no-store'});
      if (!response.ok) throw new Error('dashboard request failed');
      const data = await response.json();
      const accounts:Account[] = data.accounts.map((item:Omit<Account,'initials'>)=>({...item,unread:Number(item.unread),initials:(item.name||item.email).slice(0,1)}));
      const accountMap = new Map(accounts.map(item=>[item.id,item]));
      const connectionRows:Connection[] = data.connections.map((item:Connection)=>({...item,aliases:item.aliases.map(alias=>accountMap.get(alias.id)||alias)}));
      const rows:MailItem[] = data.emails.map((item:Omit<MailItem,'senderInitial'|'senderColor'|'time'|'unread'|'starred'> & {isRead:number;isStarred:number},index:number)=>({...item,senderInitial:item.sender.slice(0,1),senderColor:senderColors[index%senderColors.length],time:formatTime(item.receivedAt),unread:!Boolean(item.isRead),starred:Boolean(item.isStarred)}));
      setConnections(connectionRows); setAccountRows(accounts); setContacts(data.contacts||[]);
      setMailRows(rows.sort((left,right)=>right.receivedAt-left.receivedAt));
      setStats({total:Number(data.stats?.total??0),unread:Number(data.stats?.unread??0),accounts:Number(data.stats?.accounts??0),aliases:Number(data.stats?.aliases??0),today:Number(data.stats?.today??0)});
      setFolder(targetFolder);
    } catch { message.error('无法读取邮箱数据，请稍后重试。'); }
    finally { setLoading(false); }
  },[message]);

  useEffect(()=>{const timer=window.setTimeout(()=>void loadDashboard('inbox'),0);return()=>window.clearTimeout(timer);},[loadDashboard]);

  const changeView = async(next:View) => {
    setView(next);
    if (next==='sent' && folder!=='sent') await loadDashboard('sent');
    if (next!=='sent' && folder!=='inbox') await loadDashboard('inbox');
  };
  const openQr = (connectionId?:string) => { setQrTarget(connectionId||null);setQr({status:'loading'});setQrOpen(true); };
  const closeQr = () => { setQrOpen(false);setQr({status:'idle'}); };
  useEffect(()=>{
    if (!qrOpen) return;
    const controller = new AbortController();
    fetch('/api/wechat/qr',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({connectionId:qrTarget}),signal:controller.signal}).then(async response=>{
      const data=await response.json();
      if(!response.ok){setQr({status:data.code?.startsWith('AGENT_MAIL_BACKEND_')?'config_error':'error',message:data.message});return;}
      setQr({status:'ready',authUrl:data.authUrl,sessionId:data.sessionId});
    }).catch(error=>{if(error.name!=='AbortError')setQr({status:'error',message:'无法创建授权会话，请稍后重试。'});});
    return()=>controller.abort();
  },[qrOpen,qrTarget]);
  useEffect(()=>{
    if(qr.status!=='ready'||!qr.sessionId)return;
    const timer=window.setInterval(()=>fetch(`/api/wechat/qr?sessionId=${encodeURIComponent(qr.sessionId!)}`,{cache:'no-store'}).then(r=>r.json()).then(data=>{
      if(data.status==='confirmed'){window.clearInterval(timer);setQr({status:'success'});void loadDashboard(folder);window.setTimeout(()=>setQrOpen(false),1200);}
      if(data.status==='expired'){window.clearInterval(timer);setQr({status:'error',message:'二维码已过期，请关闭后重新打开。'});}
      if(data.status==='failed'){window.clearInterval(timer);setQr({status:'error',message:data.message||'官方登录程序已退出，请重新尝试。'});}
    }).catch(()=>undefined),1500);
    return()=>window.clearInterval(timer);
  },[qr.status,qr.sessionId,folder,loadDashboard]);

  const openMail = async(mail:MailItem) => {
    setDetailOpen(true);setDetailLoading(true);setDetail(null);setDetailError('');
    try { const response=await fetch(`/api/message?id=${encodeURIComponent(mail.messageId)}&workspace=${encodeURIComponent(mail.workspace)}`,{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.message||'无法读取邮件详情。');setDetail(data); }
    catch(error){setDetailError(error instanceof Error?error.message:'无法读取邮件详情。');}
    finally{setDetailLoading(false);}
  };
  const toggleStar = async(mail:MailItem) => {
    const starred=!mail.starred;
    setMailRows(rows=>rows.map(item=>item.id===mail.id?{...item,starred}:item));
    try { const response=await fetch('/api/mail/star',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:mail.messageId,workspace:mail.workspace,starred})});if(!response.ok)throw new Error(); }
    catch { setMailRows(rows=>rows.map(item=>item.id===mail.id?{...item,starred:!starred}:item));message.error('星标保存失败。'); }
  };
  const openCompose = (mail?:MailDetail) => { if(mail)setDetailOpen(false);setCompose({open:true,action:mail?'reply':'send',workspace:mail?.workspace||accountRows[0]?.workspace||'',to:mail?.from?.email||'',subject:mail?`Re: ${mail.subject}`:'',body:'',messageId:mail?.message_id,sending:false}); };
  const submitCompose = async(confirm=false) => {
    setCompose(current=>({...current,sending:true,error:undefined}));
    try {
      const payload={action:compose.action,workspace:compose.workspace,to:compose.to,subject:compose.subject,body:compose.body,messageId:compose.messageId,confirmationToken:confirm?compose.confirmationToken:undefined};
      const response=await fetch('/api/mail/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data.message||'邮件操作失败。');
      if(data.data?.confirmation_required){setCompose(current=>({...current,sending:false,confirmationToken:data.data.confirmation_token,summary:data.data.summary}));return;}
      message.success(compose.action==='reply'?'回复已进入发送队列。':'邮件已进入发送队列。');setCompose(emptyCompose);if(folder==='sent')void loadDashboard('sent');
    } catch(error){setCompose(current=>({...current,sending:false,error:error instanceof Error?error.message:'邮件操作失败。'}));}
  };

  const filtered = useMemo(()=>mailRows.filter(mail=>{const q=search.trim().toLowerCase();const accountMatched=accountFilter==='all'||mail.accountId===accountFilter||mail.connectionId===accountFilter;return accountMatched&&(category==='all'||mail.category===category)&&(status==='all'||(status==='unread'?mail.unread:mail.starred))&&(view!=='starred'||mail.starred)&&(!q||`${mail.sender}${mail.senderAddress}${mail.subject}${mail.preview}`.toLowerCase().includes(q));}),[accountFilter,category,status,search,mailRows,view]);
  const senderOptions = useMemo(()=>Array.from(new Map(accountRows.map(account=>[account.workspace,{value:account.workspace,label:account.email}])).values()),[accountRows]);
  if(!isClient)return <div style={{minHeight:'100vh',background:'#f6f8f7'}} aria-label="正在加载云邮盒"/>;

  const columns:TableColumnsType<MailItem> = [
    {title:'发件人',dataIndex:'sender',width:180,ellipsis:true,render:(_,row)=><div className="sender-cell"><Avatar size={30} style={{background:row.senderColor,fontSize:12}}>{row.senderInitial}</Avatar><span className="sender">{row.sender}</span></div>},
    {title:'主题与摘要',dataIndex:'subject',width:360,ellipsis:true,render:(_,row)=><Tooltip title={`${row.subject} — ${row.preview}`}><div className="subject-line"><span className="subject">{row.subject}</span><span className="preview">— {row.preview}</span></div></Tooltip>},
    {title:'类型',dataIndex:'category',width:82,render:value=><Tag color={value==='已发送'?'blue':'cyan'} variant="filled">{value}</Tag>},
    {title:'邮箱账号',dataIndex:'accountId',width:160,render:value=>{const item=accountRows.find(account=>account.id===value);return item?<Tag className="wechat-tag" style={{background:`${item.color}13`,color:item.color}}><span className="tag-dot" style={{background:item.color}}/>{item.name}</Tag>:<span>—</span>;}},
    {title:'时间',dataIndex:'time',width:82,render:value=><span style={{color:'#929995',fontSize:11}}>{value}</span>},
    {title:'',key:'actions',width:76,render:(_,row)=><Space size={4} onClick={event=>event.stopPropagation()}><Tooltip title={row.starred?'取消星标':'添加星标'}><Button type="text" size="small" onClick={()=>void toggleStar(row)} icon={row.starred?<StarFilled style={{color:'#f4aa28'}}/>:<StarOutlined/>}/></Tooltip><Button type="text" size="small" icon={<MoreOutlined/>}/></Space>},
  ];
  const accountMenu:MenuProps['items']=accountRows.map(item=>({key:item.id,label:item.email}));
  const pageTitle=view==='sent'?'已发送':view==='starred'?'星标邮件':view==='contacts'?'联系人':'统一收件箱';

  return <div className="mail-app"><Layout className="mail-shell">
    <Sider width={236} className="mail-sider"><div className="brand"><span className="brand-mark"><MailOutlined/></span><span className="brand-name">云邮盒</span></div>
      <Menu className="nav-menu" mode="inline" selectedKeys={[view]} onClick={({key})=>void changeView(key as View)} items={[{key:'inbox',icon:<InboxOutlined/>,label:<span>统一收件箱 {stats.unread>0&&<Badge count={stats.unread} color="#17b26a" size="small" style={{marginLeft:20}}/>}</span>},{key:'starred',icon:<StarOutlined/>,label:'星标邮件'},{key:'sent',icon:<SendOutlined/>,label:'已发送'},{key:'contacts',icon:<TeamOutlined/>,label:'联系人'}]}/>
      <div className="sider-label">微信账号</div><div className="connection-list">{connections.map(connection=><div key={connection.id} className={`connection-card ${accountFilter===connection.id?'active':''}`} onClick={()=>setAccountFilter(connection.id)}><div className="connection-head"><Badge dot status={connection.status==='online'?'success':'default'}><Avatar size={34} style={{background:connection.color}}>{connection.name.slice(0,1)}</Avatar></Badge><div><div className="account-name">{connection.name}</div><div className="account-email">{connection.aliasCount} 个邮箱</div></div><span className="account-count">{connection.unread}</span></div><div className="connection-aliases">{connection.aliases.map(alias=><button key={alias.id} className={accountFilter===alias.id?'active':''} onClick={event=>{event.stopPropagation();setAccountFilter(alias.id);}} title={alias.email}>{alias.email}</button>)}</div><Button type="link" size="small" icon={<PlusOutlined/>} onClick={event=>{event.stopPropagation();openQr(connection.id);}}>添加邮箱</Button></div>)}</div>
      <div className="add-account" onClick={()=>openQr()}><PlusOutlined/>&nbsp; 扫码添加新微信</div><div className="side-footer"><SettingOutlined/>&nbsp; 设置与数据同步</div>
    </Sider>
    <Layout className="main-layout"><Header className="topbar"><div><div className="breadcrumb-title">{pageTitle}</div><div className="breadcrumb-sub">{stats.accounts} 个微信 · {stats.aliases} 个邮箱 · 数据已加密存储</div></div><div className="header-actions"><Input className="global-search" allowClear value={search} onChange={event=>setSearch(event.target.value)} prefix={<SearchOutlined style={{color:'#a4aba7'}}/>} placeholder="搜索发件人、主题或正文"/><Tooltip title="通知"><Button shape="circle" icon={<BellOutlined/>}/></Tooltip><div className="user-pill"><Avatar size={31} style={{background:'#20332a'}} icon={<UserOutlined/>}/><span style={{fontSize:12,fontWeight:650}}>管理台</span><DownOutlined style={{fontSize:9,color:'#999'}}/></div></div></Header>
      <Content className="main-content"><div className="hero-row"><div><h1>{pageTitle}</h1><p>{view==='contacts'?'根据真实往来邮件整理的联系人。':view==='sent'?'查看所有已连接邮箱的真实发件记录。':'查看所有已连接账号的真实邮件。'}</p></div><Space><Button icon={<QrcodeOutlined/>} onClick={()=>openQr()}>添加微信</Button><Button type="primary" icon={<MailOutlined/>} disabled={!accountRows.length} onClick={()=>openCompose()}>写邮件</Button></Space></div>
        <div className="stat-row"><div className="stat-card"><div className="stat-label">全部邮件</div><div className="stat-value">{stats.total}</div></div><div className="stat-card"><div className="stat-label">未读邮件</div><div className="stat-value">{stats.unread}</div></div><div className="stat-card"><div className="stat-label">微信 / 邮箱</div><div className="stat-value">{stats.accounts} / {stats.aliases}</div></div><div className="stat-card"><div className="stat-label">今日邮件</div><div className="stat-value">{stats.today}</div></div></div>
        {view==='contacts'?<section className="contacts-card">{contacts.length?contacts.map(contact=><div className="contact-row" key={contact.email}><Avatar icon={<ContactsOutlined/>}/><div><strong>{contact.name}</strong><span>{contact.email}</span></div><Button onClick={()=>setCompose({...emptyCompose,open:true,workspace:accountRows[0]?.workspace||'',to:contact.email})}>发邮件</Button></div>):<Empty description="还没有可显示的联系人"/>}</section>:<section className="mail-card"><div className="toolbar"><div className="filter-group"><Select className="filter-select" value={accountFilter} onChange={setAccountFilter} options={[{value:'all',label:'全部微信与邮箱'},...connections.map(item=>({value:item.id,label:`${item.name}（${item.aliasCount}个邮箱）`})),...accountRows.map(item=>({value:item.id,label:item.email}))]}/><Select value={category} onChange={setCategory} options={[{value:'all',label:'全部类型'},{value:'通知',label:'通知'},{value:'已发送',label:'已发送'}]}/><Select value={status} onChange={setStatus} options={[{value:'all',label:'全部状态'},{value:'unread',label:'仅未读'},{value:'starred',label:'仅星标'}]}/><span style={{fontSize:11,color:'#9ba19e'}}>共 {filtered.length} 封 · 最新优先</span></div><Space><Tooltip title="刷新数据"><Button loading={loading} icon={<ReloadOutlined/>} onClick={()=>void loadDashboard(folder)}/></Tooltip><Dropdown disabled={!accountRows.length} menu={{items:accountMenu}}><Button>批量操作 <DownOutlined/></Button></Dropdown></Space></div><Table tableLayout="fixed" className="mail-table" rowKey="id" rowSelection={mailRows.length?{}:undefined} columns={columns} dataSource={filtered} loading={loading} locale={{emptyText:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有真实邮件"/>}} pagination={filtered.length>7?{pageSize:7,showSizeChanger:false,placement:'bottomRight'}:false} rowClassName={row=>row.unread?'unread-row':''} onRow={row=>({onClick:event=>{const target=event.target as HTMLElement;if(!target.closest('button,a,.ant-checkbox-wrapper,.ant-checkbox'))void openMail(row);}})} scroll={{x:940}}/></section>}
      </Content>
    </Layout>
  </Layout>
  <Modal className="qr-modal" open={qrOpen} onCancel={closeQr} footer={null} width={420} centered destroyOnHidden><div className="qr-modal-head"><h2><WechatFilled style={{color:'#17b26a',marginRight:9}}/>{qrTarget?'为当前微信添加邮箱':'连接新的微信账号'}</h2><p>官方授权页会在电脑端打开，请使用手机微信扫码。</p></div><div className="qr-body">{qr.status==='loading'&&<div className="qr-loading"><Spin size="large"/><p>正在启动 Agent Mail 官方登录…</p></div>}{qr.status==='ready'&&qr.authUrl&&<><div className="auth-window-icon"><WechatFilled/></div><div className="qr-status"><Badge status="processing"/> 等待电脑端授权窗口扫码</div><div className="qr-help">请在官方页面选择需要关联的邮箱；同一微信的其他邮箱请使用左侧“添加邮箱”。</div><Button className="auth-window-button" type="primary" href={qr.authUrl} target="_blank" rel="noreferrer">授权窗口未打开？重新打开</Button></>}{qr.status==='success'&&<Result status="success" title="邮箱连接成功" subTitle="正在刷新账号列表…"/>}{qr.status==='config_error'&&<Result status="warning" title="Agent Mail 服务尚未连接"/>}{qr.status==='error'&&<Result status="error" title="无法创建连接" subTitle={qr.message} extra={<Button onClick={()=>{closeQr();window.setTimeout(()=>openQr(qrTarget||undefined),0);}}>重新尝试</Button>}/>}</div></Modal>
  <Modal className="mail-detail-modal" open={detailOpen} onCancel={()=>setDetailOpen(false)} footer={detail?<Button type="primary" onClick={()=>openCompose(detail)}>回复</Button>:null} width={760} centered destroyOnHidden>{detailLoading&&<div className="mail-detail-loading"><Spin size="large"/><span>正在读取真实邮件内容…</span></div>}{!detailLoading&&detailError&&<Result status="error" title="无法打开邮件" subTitle={detailError}/>} {!detailLoading&&detail&&<article className="mail-detail"><header><Tag color="green">{detail.body_format||'PLAIN'}</Tag><h2>{detail.subject||'(无主题)'}</h2><time>{new Intl.DateTimeFormat('zh-CN',{dateStyle:'long',timeStyle:'short'}).format(new Date(detail.created_at))}</time></header><div className="mail-meta"><div><span>发件人</span><strong>{addressText(detail.from)}</strong></div><div><span>收件人</span><strong>{addressList(detail.to)}</strong></div>{Boolean(detail.cc?.length)&&<div><span>抄送</span><strong>{addressList(detail.cc)}</strong></div>}</div><pre className="mail-body-text">{messageBodyText(detail)}</pre>{Boolean(detail.attachments?.length)&&<section className="mail-attachments"><h3>附件（{detail.attachments!.length}）</h3>{detail.attachments!.map((item,index)=><div className="mail-attachment" key={item.attachment_id||`${item.filename}-${index}`}><span>{item.filename}</span><small>{[item.content_type,fileSize(item.size)].filter(Boolean).join(' · ')}</small></div>)}</section>}</article>}</Modal>
  <Modal open={compose.open} onCancel={()=>setCompose(emptyCompose)} footer={null} title={compose.action==='reply'?'回复邮件':'写邮件'} width={560} centered destroyOnHidden>{compose.confirmationToken?<Result status="warning" title="确认发送" subTitle={`发件邮箱：${compose.summary?.from||'当前邮箱'}；收件人：${compose.summary?.to?.join('、')||compose.to}；主题：${compose.summary?.subject||compose.subject}`} extra={<Space><Button onClick={()=>setCompose(emptyCompose)}>取消</Button><Button type="primary" loading={compose.sending} onClick={()=>void submitCompose(true)}>确认发送</Button></Space>}/>:<div className="compose-form"><label>发件邮箱<Select value={compose.workspace||undefined} onChange={workspace=>setCompose(current=>({...current,workspace}))} options={senderOptions}/></label>{compose.action==='send'&&<><label>收件人<Input value={compose.to} onChange={event=>setCompose(current=>({...current,to:event.target.value}))} placeholder="多个地址用逗号分隔"/></label><label>主题<Input value={compose.subject} onChange={event=>setCompose(current=>({...current,subject:event.target.value}))}/></label></>}<label>正文<Input.TextArea rows={8} value={compose.body} onChange={event=>setCompose(current=>({...current,body:event.target.value}))}/></label>{compose.error&&<div className="compose-error">{compose.error}</div>}<div className="compose-actions"><Button onClick={()=>setCompose(emptyCompose)}>取消</Button><Button type="primary" loading={compose.sending} onClick={()=>void submitCompose(false)}>检查并发送</Button></div></div>}</Modal>
  </div>;
}

export default function Home(){return <ConfigProvider theme={{token:{colorPrimary:'#17b26a',borderRadius:9,colorText:'#26302b',colorBorder:'#e7ece9',fontSize:13},components:{Button:{primaryShadow:'none'},Table:{headerBg:'#fbfcfb'}}}}><App><MailDashboard/></App></ConfigProvider>;}
