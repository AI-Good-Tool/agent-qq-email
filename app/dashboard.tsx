'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { App, Avatar, Badge, Button, ConfigProvider, Dropdown, Empty, Input, Layout, Menu, Modal, Result, Select, Space, Spin, Table, Tag, Tooltip } from 'antd';
import type { MenuProps, TableColumnsType } from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import BellOutlined from '@ant-design/icons/BellOutlined';
import ContactsOutlined from '@ant-design/icons/ContactsOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import DownOutlined from '@ant-design/icons/DownOutlined';
import EyeOutlined from '@ant-design/icons/EyeOutlined';
import InboxOutlined from '@ant-design/icons/InboxOutlined';
import LockOutlined from '@ant-design/icons/LockOutlined';
import LogoutOutlined from '@ant-design/icons/LogoutOutlined';
import MailOutlined from '@ant-design/icons/MailOutlined';
import MoreOutlined from '@ant-design/icons/MoreOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import QrcodeOutlined from '@ant-design/icons/QrcodeOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import RollbackOutlined from '@ant-design/icons/RollbackOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import SendOutlined from '@ant-design/icons/SendOutlined';
import SettingOutlined from '@ant-design/icons/SettingOutlined';
import StarFilled from '@ant-design/icons/StarFilled';
import StarOutlined from '@ant-design/icons/StarOutlined';
import TeamOutlined from '@ant-design/icons/TeamOutlined';
import TagsOutlined from '@ant-design/icons/TagsOutlined';
import UserOutlined from '@ant-design/icons/UserOutlined';
import WechatFilled from '@ant-design/icons/WechatFilled';

const { Header, Sider, Content } = Layout;
type Folder = 'inbox'|'sent'|'trash';
type View = 'inbox'|'starred'|'sent'|'trash'|'contacts';
type Account = { id:string; aliasId:string; workspace:string; connectionId:string; name:string; email:string; unread:number; color:string; initials:string; status:string; labels:string[] };
type MailItem = { id:string; messageId:string; workspace:string; connectionId:string; sender:string; senderAddress:string; senderInitial:string; senderColor:string; subject:string; preview:string; accountId:string; category:string; receivedAt:number; time:string; unread:boolean; starred:boolean };
type Stats = { total:number; unread:number; accounts:number; aliases:number; today:number };
type Contact = { name:string; email:string };
type QrState = { status:'idle'|'loading'|'ready'|'success'|'config_error'|'error'; authUrl?:string; sessionId?:string; message?:string };
type MailAddress = { name?:string; email:string };
type MailAttachment = { attachment_id?:string; filename:string; content_type?:string; size?:number; download_url?:string };
type MailDetail = { message_id:string; workspace:string; subject:string; body:string; body_format?:string; created_at:string; from?:MailAddress; to?:MailAddress[]; cc?:MailAddress[]; attachments?:MailAttachment[] };
type ComposeState = { open:boolean; action:'send'|'reply'; workspace:string; to:string; subject:string; body:string; messageId?:string; confirmationToken?:string; summary?:{from?:string;to?:string[];subject?:string}; sending:boolean; error?:string };
type LabelEditorState = { open:boolean; account:Account|null; labels:string[]; saving:boolean; error?:string };
type TrashState = { open:boolean; mail:MailItem|null; mode:'trash'|'delete'; confirmationToken?:string; summary?:unknown; deleting:boolean; error?:string };
type AuthStatus = 'checking'|'authenticated'|'anonymous';
type LoginState = { username:string; password:string; loading:boolean; error?:string };

const senderColors = ['#5d78d6','#9b68c6','#d85858','#2e9e89','#b77d42'];
const emptyCompose:ComposeState = { open:false, action:'send', workspace:'', to:'', subject:'', body:'', sending:false };
const emptyLabelEditor:LabelEditorState = { open:false, account:null, labels:[], saving:false };
const emptyTrash:TrashState = { open:false, mail:null, mode:'trash', deleting:false };
const AUTH_TOKEN_KEY = 'yunyouhe.dashboard.token';
const ACCOUNT_PREFERENCE_KEY = 'yunyouhe.dashboard.account';

async function apiFetch(input:RequestInfo|URL,init:RequestInit={}) {
  const headers=new Headers(init.headers);
  const token=window.localStorage.getItem(AUTH_TOKEN_KEY);
  if(token)headers.set('authorization',`Bearer ${token}`);
  const response=await fetch(input,{...init,headers});
  if(response.status===401)window.dispatchEvent(new Event('dashboard-auth-expired'));
  return response;
}

function formatTime(value:number) {
  const date = new Date(value); const now = new Date();
  const pad = (part:number) => String(part).padStart(2,'0');
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  if (date.toDateString() === now.toDateString()) return clock;
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${clock}`;
}
function htmlToMarkdown(html:string) {
  const document = new DOMParser().parseFromString(html,'text/html');
  const render = (node:Node):string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').replace(/\s+/g,' ');
    if (!(node instanceof HTMLElement)) return '';
    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes).map(render).join('');
    const text = children.trim();
    if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag.slice(1)))} ${text}\n\n`;
    if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') return `${text}\n\n`;
    if (tag === 'br') return '\n';
    if (tag === 'strong' || tag === 'b') return `**${text}**`;
    if (tag === 'em' || tag === 'i') return `_${text}_`;
    if (tag === 'del' || tag === 's') return `~~${text}~~`;
    if (tag === 'blockquote') return `${text.split('\n').map(line=>`> ${line}`).join('\n')}\n\n`;
    if (tag === 'pre') return `\`\`\`\n${node.textContent?.trim() || ''}\n\`\`\`\n\n`;
    if (tag === 'code') return `\`${node.textContent || ''}\``;
    if (tag === 'li') return `- ${text}\n`;
    if (tag === 'ul' || tag === 'ol') return `${children}\n`;
    if (tag === 'a') {
      const href = node.getAttribute('href') || '';
      return /^(https?:|mailto:)/i.test(href) ? `[${text || href}](${href})` : text;
    }
    if (tag === 'hr') return '\n---\n\n';
    if (tag === 'img') return node.getAttribute('alt') ? `*图片：${node.getAttribute('alt')}*` : '';
    if (tag === 'tr') return `${text}\n`;
    if (tag === 'td' || tag === 'th') return `${text} | `;
    return children;
  };
  return Array.from(document.body.childNodes).map(render).join('').replace(/\n{3,}/g,'\n\n').trim();
}
function messageMarkdown(detail:MailDetail|null) {
  if (!detail?.body) return '（邮件正文为空）';
  if (detail.body_format?.toUpperCase() !== 'HTML') return detail.body;
  return htmlToMarkdown(detail.body);
}
function addressText(address?:MailAddress) { return address ? [address.name,address.email&&`<${address.email}>`].filter(Boolean).join(' ') : '—'; }
function addressList(addresses?:MailAddress[]) { return addresses?.length ? addresses.map(addressText).join('、') : '—'; }
function fileSize(value?:number) { if (!value) return ''; if (value<1024) return `${value} B`; if (value<1024*1024) return `${(value/1024).toFixed(1)} KB`; return `${(value/1024/1024).toFixed(1)} MB`; }

function MailDashboard() {
  const isClient = useSyncExternalStore(()=>()=>{},()=>true,()=>false);
  const { message } = App.useApp();
  const [authStatus,setAuthStatus] = useState<AuthStatus>('checking');
  const [login,setLogin] = useState<LoginState>({username:'admin',password:'',loading:false});
  const [view,setView] = useState<View>('inbox');
  const [folder,setFolder] = useState<Folder>('inbox');
  const [accountFilter,setAccountFilter] = useState('default');
  const [labelFilter,setLabelFilter] = useState('all');
  const [category,setCategory] = useState('all');
  const [status,setStatus] = useState('all');
  const [search,setSearch] = useState('');
  const [loading,setLoading] = useState(true);
  const [accountRows,setAccountRows] = useState<Account[]>([]);
  const [mailRows,setMailRows] = useState<MailItem[]>([]);
  const [contacts,setContacts] = useState<Contact[]>([]);
  const [stats,setStats] = useState<Stats>({total:0,unread:0,accounts:0,aliases:0,today:0});
  const [qrOpen,setQrOpen] = useState(false);
  const [qr,setQr] = useState<QrState>({status:'idle'});
  const [detailOpen,setDetailOpen] = useState(false);
  const [detailLoading,setDetailLoading] = useState(false);
  const [detail,setDetail] = useState<MailDetail|null>(null);
  const [detailError,setDetailError] = useState('');
  const [compose,setCompose] = useState<ComposeState>(emptyCompose);
  const [labelEditor,setLabelEditor] = useState<LabelEditorState>(emptyLabelEditor);
  const [trash,setTrash] = useState<TrashState>(emptyTrash);

  const loadDashboard = useCallback(async(targetFolder:Folder,targetAccount='default')=>{
    setLoading(true);
    try {
      const response = await apiFetch(`/api/dashboard?folder=${targetFolder}&account=${encodeURIComponent(targetAccount)}`,{cache:'no-store'});
      if(response.status===401)return;
      if (!response.ok) throw new Error('dashboard request failed');
      const data = await response.json();
      const accounts:Account[] = data.accounts.map((item:Omit<Account,'initials'>)=>({...item,labels:Array.isArray(item.labels)?item.labels:[],unread:Number(item.unread),initials:(item.name||item.email).slice(0,1)}));
      const rows:MailItem[] = data.emails.map((item:Omit<MailItem,'senderInitial'|'senderColor'|'time'|'unread'|'starred'> & {isRead:number;isStarred:number},index:number)=>({...item,senderInitial:item.sender.slice(0,1),senderColor:senderColors[index%senderColors.length],time:formatTime(item.receivedAt),unread:!Boolean(item.isRead),starred:Boolean(item.isStarred)}));
      setAccountRows(accounts); setContacts(data.contacts||[]);
      setMailRows(rows.sort((left,right)=>right.receivedAt-left.receivedAt));
      setStats({total:Number(data.stats?.total??0),unread:Number(data.stats?.unread??0),accounts:Number(data.stats?.accounts??0),aliases:Number(data.stats?.aliases??0),today:Number(data.stats?.today??0)});
      const selectedAccount=data.selectedAccountId||targetAccount;
      setAccountFilter(selectedAccount);
      window.localStorage.setItem(ACCOUNT_PREFERENCE_KEY,selectedAccount);
      setFolder(targetFolder);
    } catch { message.error('无法读取邮箱数据，请稍后重试。'); }
    finally { setLoading(false); }
  },[message]);

  useEffect(()=>{
    const expire=()=>{window.localStorage.removeItem(AUTH_TOKEN_KEY);setAuthStatus('anonymous');setLogin(current=>({...current,password:'',error:'登录状态已失效，请重新登录。'}));};
    window.addEventListener('dashboard-auth-expired',expire);return()=>window.removeEventListener('dashboard-auth-expired',expire);
  },[]);
  useEffect(()=>{
    const token=window.localStorage.getItem(AUTH_TOKEN_KEY);
    if(!token){setAuthStatus('anonymous');return;}
    apiFetch('/api/session',{cache:'no-store'}).then(async response=>{if(response.ok)setAuthStatus('authenticated');else setAuthStatus('anonymous');}).catch(()=>setAuthStatus('anonymous'));
  },[]);
  useEffect(()=>{
    if(authStatus!=='authenticated')return;
    const preferred=window.localStorage.getItem(ACCOUNT_PREFERENCE_KEY)||'default';
    const timer=window.setTimeout(()=>void loadDashboard('inbox',preferred),0);return()=>window.clearTimeout(timer);
  },[authStatus,loadDashboard]);

  const submitLogin = async() => {
    if(!login.username.trim()||!login.password){setLogin(current=>({...current,error:'请输入账号和密码。'}));return;}
    setLogin(current=>({...current,loading:true,error:undefined}));
    try {
      const response=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:login.username.trim(),password:login.password})});
      const data=await response.json();if(!response.ok)throw new Error(data.message||'登录失败。');
      window.localStorage.setItem(AUTH_TOKEN_KEY,data.token);setLogin(current=>({...current,password:'',loading:false}));setAuthStatus('authenticated');
    } catch(error){setLogin(current=>({...current,loading:false,error:error instanceof Error?error.message:'登录失败。'}));}
  };
  const logout = () => { window.localStorage.removeItem(AUTH_TOKEN_KEY);setAuthStatus('anonymous');setLogin({username:'admin',password:'',loading:false});setMailRows([]);setAccountRows([]); };

  const changeView = async(next:View) => {
    setView(next);
    setCategory('all');
    setStatus(next==='starred'?'starred':'all');
    const nextFolder:Folder=next==='sent'?'sent':next==='trash'?'trash':'inbox';
    if(nextFolder!==folder)await loadDashboard(nextFolder,accountFilter);
  };
  const changeAccount = async(nextAccount:string) => { setAccountFilter(nextAccount);window.localStorage.setItem(ACCOUNT_PREFERENCE_KEY,nextAccount);await loadDashboard(folder,nextAccount); };
  const openQr = () => { setQr({status:'loading'});setQrOpen(true); };
  const closeQr = () => { setQrOpen(false);setQr({status:'idle'}); };
  useEffect(()=>{
    if (!qrOpen) return;
    const controller = new AbortController();
    apiFetch('/api/wechat/qr',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({}),signal:controller.signal}).then(async response=>{
      const data=await response.json();
      if(!response.ok){setQr({status:data.code?.startsWith('AGENT_MAIL_BACKEND_')?'config_error':'error',message:data.message});return;}
      setQr({status:'ready',authUrl:data.authUrl,sessionId:data.sessionId});
    }).catch(error=>{if(error.name!=='AbortError')setQr({status:'error',message:'无法创建授权会话，请稍后重试。'});});
    return()=>controller.abort();
  },[qrOpen]);
  useEffect(()=>{
    if(qr.status!=='ready'||!qr.sessionId)return;
    const timer=window.setInterval(()=>apiFetch(`/api/wechat/qr?sessionId=${encodeURIComponent(qr.sessionId!)}`,{cache:'no-store'}).then(r=>r.json()).then(data=>{
      if(data.status==='confirmed'){window.clearInterval(timer);setQr({status:'success'});void loadDashboard(folder,accountFilter);window.setTimeout(()=>setQrOpen(false),1200);}
      if(data.status==='expired'){window.clearInterval(timer);setQr({status:'error',message:'二维码已过期，请关闭后重新打开。'});}
      if(data.status==='failed'){window.clearInterval(timer);setQr({status:'error',message:data.message||'官方登录程序已退出，请重新尝试。'});}
    }).catch(()=>undefined),1500);
    return()=>window.clearInterval(timer);
  },[qr.status,qr.sessionId,folder,accountFilter,loadDashboard]);

  const openMail = async(mail:MailItem) => {
    setDetailOpen(true);setDetailLoading(true);setDetail(null);setDetailError('');
    try { const response=await apiFetch(`/api/message?id=${encodeURIComponent(mail.messageId)}&workspace=${encodeURIComponent(mail.workspace)}`,{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.message||'无法读取邮件详情。');setDetail(data); }
    catch(error){setDetailError(error instanceof Error?error.message:'无法读取邮件详情。');}
    finally{setDetailLoading(false);}
  };
  const replyToMail = async(mail:MailItem) => {
    const closeLoading=message.loading('正在读取邮件…',0);
    try {
      const response=await apiFetch(`/api/message?id=${encodeURIComponent(mail.messageId)}&workspace=${encodeURIComponent(mail.workspace)}`,{cache:'no-store'});
      const data=await response.json();if(!response.ok)throw new Error(data.message||'无法读取邮件详情。');
      openCompose(data);
    } catch(error){message.error(error instanceof Error?error.message:'无法读取邮件详情。');}
    finally{closeLoading();}
  };
  const toggleStar = async(mail:MailItem) => {
    const starred=!mail.starred;
    setMailRows(rows=>rows.map(item=>item.id===mail.id?{...item,starred}:item));
    try { const response=await apiFetch('/api/mail/star',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:mail.messageId,workspace:mail.workspace,starred})});if(!response.ok)throw new Error(); }
    catch { setMailRows(rows=>rows.map(item=>item.id===mail.id?{...item,starred:!starred}:item));message.error('星标保存失败。'); }
  };
  const submitTrash = async() => {
    if(!trash.mail)return;
    setTrash(current=>({...current,deleting:true,error:undefined}));
    try {
      const response=await apiFetch('/api/mail/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:trash.mode,workspace:trash.mail.workspace,messageId:trash.mail.messageId,confirmationToken:trash.confirmationToken})});
      const data=await response.json();if(!response.ok)throw new Error(data.message||'删除邮件失败。');
      if(data.data?.confirmation_required){setTrash(current=>({...current,deleting:false,confirmationToken:data.data.confirmation_token,summary:data.data.summary}));return;}
      setMailRows(rows=>rows.filter(mail=>mail.id!==trash.mail!.id));const deletedPermanently=trash.mode==='delete';setTrash(emptyTrash);message.success(deletedPermanently?'邮件已永久删除。':'邮件已移入垃圾箱，将保留 30 天。');void loadDashboard(folder,accountFilter);
    } catch(error){setTrash(current=>({...current,deleting:false,error:error instanceof Error?error.message:'删除邮件失败。'}));}
  };
  const openCompose = (mail?:MailDetail) => { if(mail)setDetailOpen(false);setCompose({open:true,action:mail?'reply':'send',workspace:mail?.workspace||accountRows[0]?.workspace||'',to:mail?.from?.email||'',subject:mail?`Re: ${mail.subject}`:'',body:'',messageId:mail?.message_id,sending:false}); };
  const openLabelEditor = (account:Account) => setLabelEditor({open:true,account,labels:account.labels,saving:false});
  const saveLabels = async() => {
    if (!labelEditor.account) return;
    const labels=Array.from(new Set(labelEditor.labels.map(label=>label.trim()).filter(Boolean)));
    if(labels.length>8){setLabelEditor(current=>({...current,error:'每个邮箱最多设置 8 个标签。'}));return;}
    if(labels.some(label=>label.length>16)){setLabelEditor(current=>({...current,error:'单个标签不能超过 16 个字符。'}));return;}
    setLabelEditor(current=>({...current,saving:true,error:undefined}));
    try {
      const response=await apiFetch('/api/mailbox-label',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({aliasId:labelEditor.account.aliasId,workspace:labelEditor.account.workspace,labels})});
      const data=await response.json();if(!response.ok)throw new Error(data.message||'标签保存失败。');
      setAccountRows(rows=>rows.map(account=>account.id===labelEditor.account!.id?{...account,labels:data.labels||labels}:account));
      setLabelEditor(emptyLabelEditor);message.success('邮箱标签已保存。');
    } catch(error){setLabelEditor(current=>({...current,saving:false,error:error instanceof Error?error.message:'标签保存失败。'}));}
  };
  const submitCompose = async(confirm=false) => {
    setCompose(current=>({...current,sending:true,error:undefined}));
    try {
      const payload={action:compose.action,workspace:compose.workspace,to:compose.to,subject:compose.subject,body:compose.body,messageId:compose.messageId,confirmationToken:confirm?compose.confirmationToken:undefined};
      const response=await apiFetch('/api/mail/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data.message||'邮件操作失败。');
      if(data.data?.confirmation_required){setCompose(current=>({...current,sending:false,confirmationToken:data.data.confirmation_token,summary:data.data.summary}));return;}
      message.success(compose.action==='reply'?'回复已进入发送队列。':'邮件已进入发送队列。');setCompose(emptyCompose);if(folder==='sent')void loadDashboard('sent',accountFilter);
    } catch(error){setCompose(current=>({...current,sending:false,error:error instanceof Error?error.message:'邮件操作失败。'}));}
  };

  const accountMap = useMemo(()=>new Map(accountRows.map(account=>[account.id,account])),[accountRows]);
  const allLabels = useMemo(()=>Array.from(new Set(accountRows.flatMap(account=>account.labels))).sort((left,right)=>left.localeCompare(right,'zh-CN')),[accountRows]);
  const filtered = useMemo(()=>mailRows.filter(mail=>{const q=search.trim().toLowerCase();const account=accountMap.get(mail.accountId);const accountMatched=accountFilter==='all'||mail.accountId===accountFilter;const labelMatched=labelFilter==='all'||(labelFilter==='untagged'?!account?.labels.length:account?.labels.includes(labelFilter));return accountMatched&&labelMatched&&(category==='all'||mail.category===category)&&(status==='all'||(status==='unread'?mail.unread:mail.starred))&&(view!=='starred'||mail.starred)&&(!q||`${mail.sender}${mail.senderAddress}${mail.subject}${mail.preview}`.toLowerCase().includes(q));}),[accountFilter,labelFilter,category,status,search,mailRows,view,accountMap]);
  const senderOptions = useMemo(()=>Array.from(new Map(accountRows.map(account=>[account.workspace,{value:account.workspace,label:account.email}])).values()),[accountRows]);
  if(!isClient)return <div style={{minHeight:'100vh',background:'#f6f8f7'}} aria-label="正在加载云邮盒"/>;
  if(authStatus==='checking')return <div className="auth-loading"><Spin size="large"/><span>正在验证登录状态…</span></div>;
  if(authStatus==='anonymous')return <div className="login-page"><div className="login-panel"><div className="login-brand"><span className="brand-mark"><MailOutlined/></span><div><strong>云邮盒</strong><span>邮箱管理控制台</span></div></div><div className="login-heading"><h1>欢迎回来</h1><p>登录后管理已连接的微信邮箱。</p></div><div className="login-form"><label>账号<Input autoFocus autoComplete="username" prefix={<UserOutlined/>} value={login.username} onChange={event=>setLogin(current=>({...current,username:event.target.value,error:undefined}))} placeholder="请输入账号"/></label><label>密码<Input.Password autoComplete="current-password" prefix={<LockOutlined/>} value={login.password} onChange={event=>setLogin(current=>({...current,password:event.target.value,error:undefined}))} onPressEnter={()=>void submitLogin()} placeholder="请输入密码"/></label>{login.error&&<div className="login-error">{login.error}</div>}<Button type="primary" size="large" loading={login.loading} onClick={()=>void submitLogin()}>登录</Button></div><div className="login-security"><LockOutlined/> 登录状态将安全保存在当前浏览器中</div></div><div className="login-visual"><div className="login-orbit"><MailOutlined/></div><h2>一个工作台，管理所有邮箱</h2><p>聚合邮件、标签筛选与安全操作，数据由本地服务加密存储。</p></div></div>;

  const mailActionMenu = (row:MailItem):MenuProps => ({
    items:[
      {key:'detail',icon:<EyeOutlined/>,label:'查看详情'},
      {key:'reply',icon:<RollbackOutlined/>,label:'回复邮件'},
      {type:'divider'},
      {key:'star',icon:row.starred?<StarFilled style={{color:'#f4aa28'}}/>:<StarOutlined/>,label:row.starred?'取消星标':'添加星标'},
      {type:'divider'},
      folder==='trash'
        ? {key:'delete',danger:true,icon:<DeleteOutlined/>,label:'永久删除'}
        : {key:'trash',danger:true,icon:<DeleteOutlined/>,label:'删除邮件'},
    ],
    onClick:({key})=>{
      if(key==='detail')void openMail(row);
      if(key==='reply')void replyToMail(row);
      if(key==='star')void toggleStar(row);
      if(key==='trash'||key==='delete')setTrash({open:true,mail:row,mode:key==='delete'?'delete':'trash',deleting:false});
    },
  });

  const columns:TableColumnsType<MailItem> = [
    {title:'发件人',dataIndex:'sender',width:180,ellipsis:true,render:(_,row)=><div className="sender-cell"><Avatar size={30} style={{background:row.senderColor,fontSize:12}}>{row.senderInitial}</Avatar><span className="sender">{row.sender}</span></div>},
    {title:'主题与摘要',dataIndex:'subject',width:360,ellipsis:true,render:(_,row)=><Tooltip title={`${row.subject} — ${row.preview}`}><div className="subject-line"><span className="subject">{row.subject}</span><span className="preview">— {row.preview}</span></div></Tooltip>},
    {title:'类型',dataIndex:'category',width:82,render:value=><Tag color={value==='已发送'?'blue':'cyan'} variant="filled">{value}</Tag>},
    {title:'邮箱账号',dataIndex:'accountId',width:190,render:value=>{const item=accountMap.get(value);return item?<div className="mail-account-cell"><Tag className="wechat-tag" style={{background:`${item.color}13`,color:item.color}}><span className="tag-dot" style={{background:item.color}}/>{item.name}</Tag>{item.labels.slice(0,1).map(label=><Tag className="mail-label-tag" key={label}>{label}</Tag>)}</div>:<span>—</span>;}},
    {title:'时间',dataIndex:'time',width:164,render:value=><span className="mail-time">{value}</span>},
    {title:'',key:'actions',width:76,render:(_,row)=><Space size={4} onClick={event=>event.stopPropagation()}><Tooltip title={row.starred?'取消星标':'添加星标'}><Button type="text" size="small" onClick={()=>void toggleStar(row)} icon={row.starred?<StarFilled style={{color:'#f4aa28'}}/>:<StarOutlined/>}/></Tooltip><Dropdown trigger={['click']} placement="bottomRight" menu={mailActionMenu(row)}><Tooltip title="更多操作"><Button type="text" size="small" aria-label="更多邮件操作" icon={<MoreOutlined/>}/></Tooltip></Dropdown></Space>},
  ];
  const accountMenu:MenuProps['items']=accountRows.map(item=>({key:item.id,label:item.email}));
  const pageTitle=view==='sent'?'已发送':view==='trash'?'垃圾箱':view==='starred'?'星标邮件':view==='contacts'?'联系人':'统一收件箱';

  return <div className="mail-app"><Layout className="mail-shell">
    <Sider width={236} className="mail-sider"><div className="brand"><span className="brand-mark"><MailOutlined/></span><span className="brand-name">云邮盒</span></div>
      <Menu className="nav-menu" mode="inline" selectedKeys={[view]} onClick={({key})=>void changeView(key as View)} items={[{key:'inbox',icon:<InboxOutlined/>,label:<span>统一收件箱 {stats.unread>0&&<Badge count={stats.unread} color="#17b26a" size="small" style={{marginLeft:20}}/>}</span>},{key:'starred',icon:<StarOutlined/>,label:'星标邮件'},{key:'sent',icon:<SendOutlined/>,label:'已发送'},{key:'trash',icon:<DeleteOutlined/>,label:'垃圾箱'},{key:'contacts',icon:<TeamOutlined/>,label:'联系人'}]}/>
      <div className="sider-label">邮箱账号</div><div className="account-list">{accountRows.map(account=><div key={account.id} className={`account-item ${accountFilter===account.id?'active':''}`}><button type="button" className="account-chip" onClick={()=>void changeAccount(account.id)} title={account.email}><Badge dot status={account.status==='online'?'success':'default'}><Avatar size={34} style={{background:account.color}}>{account.initials}</Avatar></Badge><span className="account-details"><span className="account-email-primary">{account.email}</span>{account.labels.length>0&&<span className="account-labels">{account.labels.slice(0,2).map(label=><span key={label}>{label}</span>)}{account.labels.length>2&&<small>+{account.labels.length-2}</small>}</span>}</span>{account.unread>0&&<span className="account-count">{account.unread}</span>}</button><Tooltip title="设置标签"><Button className="account-label-button" type="text" size="small" aria-label={`设置 ${account.email} 标签`} icon={<TagsOutlined/>} onClick={()=>openLabelEditor(account)}/></Tooltip></div>)}</div>
      <div className="add-account" onClick={()=>openQr()}><PlusOutlined/>&nbsp; 扫码添加新微信</div><div className="side-footer"><SettingOutlined/>&nbsp; 设置与数据同步</div>
    </Sider>
    <Layout className="main-layout"><Header className="topbar"><div><div className="breadcrumb-title">{pageTitle}</div><div className="breadcrumb-sub">{stats.accounts} 个微信 · {stats.aliases} 个邮箱 · 数据已加密存储</div></div><div className="header-actions"><Input className="global-search" allowClear value={search} onChange={event=>setSearch(event.target.value)} prefix={<SearchOutlined style={{color:'#a4aba7'}}/>} placeholder="搜索发件人、主题或正文"/><Tooltip title="通知"><Button shape="circle" icon={<BellOutlined/>}/></Tooltip><Dropdown trigger={['click']} placement="bottomRight" menu={{items:[{key:'logout',icon:<LogoutOutlined/>,danger:true,label:'退出登录'}],onClick:({key})=>{if(key==='logout')logout();}}}><button className="user-pill" type="button"><Avatar size={31} style={{background:'#20332a'}} icon={<UserOutlined/>}/><span>admin</span><DownOutlined/></button></Dropdown></div></Header>
      <Content className="main-content"><div className="hero-row"><div><h1>{pageTitle}</h1><p>{view==='contacts'?'根据真实往来邮件整理的联系人。':view==='trash'?'查看已移入垃圾箱的邮件，可永久删除。':view==='sent'?'查看所选邮箱的真实发件记录。':'查看所选邮箱的真实邮件。'}</p></div><Space><Button icon={<QrcodeOutlined/>} onClick={()=>openQr()}>添加微信</Button><Button type="primary" icon={<MailOutlined/>} disabled={!accountRows.length} onClick={()=>openCompose()}>写邮件</Button></Space></div>
        <div className="stat-row"><div className="stat-card"><div className="stat-label">全部邮件</div><div className="stat-value">{stats.total}</div></div><div className="stat-card"><div className="stat-label">未读邮件</div><div className="stat-value">{stats.unread}</div></div><div className="stat-card"><div className="stat-label">微信 / 邮箱</div><div className="stat-value">{stats.accounts} / {stats.aliases}</div></div><div className="stat-card"><div className="stat-label">今日邮件</div><div className="stat-value">{stats.today}</div></div></div>
        {view==='contacts'?<section className="contacts-card">{contacts.length?contacts.map(contact=><div className="contact-row" key={contact.email}><Avatar icon={<ContactsOutlined/>}/><div><strong>{contact.name}</strong><span>{contact.email}</span></div><Button onClick={()=>setCompose({...emptyCompose,open:true,workspace:accountRows[0]?.workspace||'',to:contact.email})}>发邮件</Button></div>):<Empty description="还没有可显示的联系人"/>}</section>:<section className="mail-card"><div className="toolbar"><div className="filter-group"><Select className="filter-select mailbox-filter" popupMatchSelectWidth={340} value={accountFilter} onChange={value=>void changeAccount(value)} options={[...accountRows.map(item=>({value:item.id,label:item.email})),{value:'all',label:'全部邮箱（加载较慢）'}]}/><Select className="label-filter" value={labelFilter} onChange={setLabelFilter} options={[{value:'all',label:'全部标签'},{value:'untagged',label:'未设置标签'},...allLabels.map(label=>({value:label,label}))]}/><Select value={category} onChange={setCategory} options={[{value:'all',label:'全部类型'},{value:'通知',label:'通知'},{value:'已发送',label:'已发送'},{value:'垃圾箱',label:'垃圾箱'}]}/><Select value={status} onChange={setStatus} options={[{value:'all',label:'全部状态'},{value:'unread',label:'仅未读'},{value:'starred',label:'仅星标'}]}/><span style={{fontSize:11,color:'#9ba19e'}}>共 {filtered.length} 封 · 最新优先</span></div><Space><Tooltip title="刷新数据"><Button loading={loading} icon={<ReloadOutlined/>} onClick={()=>void loadDashboard(folder,accountFilter)}/></Tooltip><Dropdown disabled={!accountRows.length} menu={{items:accountMenu}}><Button>批量操作 <DownOutlined/></Button></Dropdown></Space></div><Table tableLayout="fixed" className="mail-table" rowKey="id" rowSelection={mailRows.length?{}:undefined} columns={columns} dataSource={filtered} loading={loading} locale={{emptyText:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={view==='trash'?'垃圾箱是空的':'还没有真实邮件'}/>}} pagination={filtered.length>7?{pageSize:7,showSizeChanger:false,placement:'bottomRight'}:false} rowClassName={row=>row.unread?'unread-row':''} onRow={row=>({onClick:event=>{const target=event.target as HTMLElement;if(!target.closest('button,a,.ant-checkbox-wrapper,.ant-checkbox'))void openMail(row);}})} scroll={{x:1060}}/></section>}
      </Content>
    </Layout>
  </Layout>
  <Modal className="qr-modal" open={qrOpen} onCancel={closeQr} footer={null} width={420} centered destroyOnHidden><div className="qr-modal-head"><h2><WechatFilled style={{color:'#17b26a',marginRight:9}}/>连接新的微信账号</h2><p>官方授权页会在电脑端打开，请使用手机微信扫码。</p></div><div className="qr-body">{qr.status==='loading'&&<div className="qr-loading"><Spin size="large"/><p>正在启动 Agent Mail 官方登录…</p></div>}{qr.status==='ready'&&qr.authUrl&&<><div className="auth-window-icon"><WechatFilled/></div><div className="qr-status"><Badge status="processing"/> 等待电脑端授权窗口扫码</div><div className="qr-help">请在官方页面选择需要连接的邮箱，连接成功后会作为独立邮箱显示。</div><Button className="auth-window-button" type="primary" href={qr.authUrl} target="_blank" rel="noreferrer">授权窗口未打开？重新打开</Button></>}{qr.status==='success'&&<Result status="success" title="邮箱连接成功" subTitle="正在刷新邮箱列表…"/>}{qr.status==='config_error'&&<Result status="warning" title="Agent Mail 服务尚未连接"/>}{qr.status==='error'&&<Result status="error" title="无法创建连接" subTitle={qr.message} extra={<Button onClick={()=>{closeQr();window.setTimeout(()=>openQr(),0);}}>重新尝试</Button>}/>}</div></Modal>
  <Modal className="mail-detail-modal" open={detailOpen} onCancel={()=>setDetailOpen(false)} footer={detail?<Button type="primary" onClick={()=>openCompose(detail)}>回复</Button>:null} width={820} centered destroyOnHidden>{detailLoading&&<div className="mail-detail-loading"><Spin size="large"/><span>正在读取真实邮件内容…</span></div>}{!detailLoading&&detailError&&<Result status="error" title="无法打开邮件" subTitle={detailError}/>} {!detailLoading&&detail&&<article className="mail-detail"><header><Tag color="green">MARKDOWN</Tag><h2>{detail.subject||'(无主题)'}</h2><time>{new Intl.DateTimeFormat('zh-CN',{dateStyle:'long',timeStyle:'medium'}).format(new Date(detail.created_at))}</time></header><div className="mail-meta"><div><span>发件人</span><strong>{addressText(detail.from)}</strong></div><div><span>收件人</span><strong>{addressList(detail.to)}</strong></div>{Boolean(detail.cc?.length)&&<div><span>抄送</span><strong>{addressList(detail.cc)}</strong></div>}</div><div className="mail-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{messageMarkdown(detail)}</ReactMarkdown></div>{Boolean(detail.attachments?.length)&&<section className="mail-attachments"><h3>附件（{detail.attachments!.length}）</h3>{detail.attachments!.map((item,index)=><div className="mail-attachment" key={item.attachment_id||`${item.filename}-${index}`}><span>{item.filename}</span><small>{[item.content_type,fileSize(item.size)].filter(Boolean).join(' · ')}</small></div>)}</section>}</article>}</Modal>
  <Modal className="label-modal" open={labelEditor.open} onCancel={()=>setLabelEditor(emptyLabelEditor)} onOk={()=>void saveLabels()} confirmLoading={labelEditor.saving} title="设置邮箱标签" okText="保存标签" cancelText="取消" width={480} centered destroyOnHidden><div className="label-editor"><div className="label-account"><TagsOutlined/><div><strong>{labelEditor.account?.email}</strong><span>最多 8 个标签，每个标签不超过 16 个字符</span></div></div><Select mode="tags" value={labelEditor.labels} onChange={labels=>setLabelEditor(current=>({...current,labels,error:undefined}))} tokenSeparators={[',','，']} placeholder="输入标签后按回车，例如：工作、个人" options={allLabels.map(label=>({value:label,label}))}/>{labelEditor.error&&<div className="compose-error">{labelEditor.error}</div>}<p>已有标签可直接选择，也可以输入新标签；清空后保存即可移除全部标签。</p></div></Modal>
  <Modal className="trash-modal" open={trash.open} onCancel={()=>!trash.deleting&&setTrash(emptyTrash)} onOk={()=>void submitTrash()} confirmLoading={trash.deleting} title={trash.mode==='delete'?'永久删除这封邮件？':'删除这封邮件？'} okText={trash.confirmationToken?(trash.mode==='delete'?'确认永久删除':'确认删除'):(trash.mode==='delete'?'永久删除':'移入垃圾箱')} cancelText="取消" okButtonProps={{danger:true}} cancelButtonProps={{disabled:trash.deleting}} width={480} centered destroyOnHidden><div className="trash-confirm"><div className="trash-icon"><DeleteOutlined/></div><div><strong>{trash.mail?.subject||'(无主题)'}</strong><span>发件人：{trash.mail?.sender||'未知发件人'}</span></div></div><p className="trash-note">{trash.mode==='delete'?'邮件将从垃圾箱永久删除，且无法恢复。':'邮件将移入 Agent Mail 垃圾箱并保留 30 天，不会立即永久删除。'}</p>{trash.confirmationToken&&<div className="trash-server-confirm"><b>官方服务要求再次确认</b><span>请核对以下信息后点击确认按钮。</span>{trash.summary!=null&&<pre>{typeof trash.summary==='string'?trash.summary:JSON.stringify(trash.summary,null,2)}</pre>}</div>}{trash.error&&<div className="compose-error">{trash.error}</div>}</Modal>
  <Modal open={compose.open} onCancel={()=>setCompose(emptyCompose)} footer={null} title={compose.action==='reply'?'回复邮件':'写邮件'} width={560} centered destroyOnHidden>{compose.confirmationToken?<Result status="warning" title="确认发送" subTitle={`发件邮箱：${compose.summary?.from||'当前邮箱'}；收件人：${compose.summary?.to?.join('、')||compose.to}；主题：${compose.summary?.subject||compose.subject}`} extra={<Space><Button onClick={()=>setCompose(emptyCompose)}>取消</Button><Button type="primary" loading={compose.sending} onClick={()=>void submitCompose(true)}>确认发送</Button></Space>}/>:<div className="compose-form"><label>发件邮箱<Select value={compose.workspace||undefined} onChange={workspace=>setCompose(current=>({...current,workspace}))} options={senderOptions}/></label>{compose.action==='send'&&<><label>收件人<Input value={compose.to} onChange={event=>setCompose(current=>({...current,to:event.target.value}))} placeholder="多个地址用逗号分隔"/></label><label>主题<Input value={compose.subject} onChange={event=>setCompose(current=>({...current,subject:event.target.value}))}/></label></>}<label>正文<Input.TextArea rows={8} value={compose.body} onChange={event=>setCompose(current=>({...current,body:event.target.value}))}/></label>{compose.error&&<div className="compose-error">{compose.error}</div>}<div className="compose-actions"><Button onClick={()=>setCompose(emptyCompose)}>取消</Button><Button type="primary" loading={compose.sending} onClick={()=>void submitCompose(false)}>检查并发送</Button></div></div>}</Modal>
  </div>;
}

export default function Home(){return <ConfigProvider theme={{token:{colorPrimary:'#17b26a',borderRadius:9,colorText:'#26302b',colorBorder:'#e7ece9',fontSize:13},components:{Button:{primaryShadow:'none'},Table:{headerBg:'#fbfcfb'}}}}><App><MailDashboard/></App></ConfigProvider>;}
