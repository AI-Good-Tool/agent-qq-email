'use client';

import { useEffect, useMemo, useState } from 'react';
import { App, Avatar, Badge, Button, ConfigProvider, Dropdown, Input, Layout, Menu, Modal, Select, Space, Table, Tag, Tooltip } from 'antd';
import type { MenuProps, TableColumnsType } from 'antd';
import { BellOutlined, CheckCircleFilled, DownOutlined, InboxOutlined, MailOutlined, MoreOutlined, PlusOutlined, QrcodeOutlined, ReloadOutlined, SearchOutlined, SendOutlined, SettingOutlined, StarFilled, StarOutlined, TeamOutlined, WechatFilled } from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';

const { Header, Sider, Content } = Layout;
type Account = { id:string; name:string; email:string; unread:number; color:string; initials:string };
type MailItem = { id:string; sender:string; senderInitial:string; senderColor:string; subject:string; preview:string; accountId:string; category:'工作'|'订阅'|'账单'|'通知'; time:string; unread:boolean; starred:boolean };

const demoAccounts: Account[] = [
  { id:'wx-lin', name:'林墨 · 工作号', email:'linmo@wechat.com', unread:12, color:'#20b26b', initials:'林' },
  { id:'wx-life', name:'林墨 · 生活号', email:'molin@foxmail.com', unread:5, color:'#6e7ed8', initials:'墨' },
  { id:'wx-team', name:'星野团队', email:'hello@xingye.cn', unread:3, color:'#e79a3b', initials:'星' },
];
const demoMails: MailItem[] = [
  { id:'1', sender:'张宁', senderInitial:'张', senderColor:'#5d78d6', subject:'产品周会纪要与本周待办', preview:'附件中是今天讨论的需求优先级，请大家在周四前确认…', accountId:'wx-lin', category:'工作', time:'10:32', unread:true, starred:true },
  { id:'2', sender:'Figma', senderInitial:'F', senderColor:'#9b68c6', subject:'You have 6 new comments', preview:'Mia and 3 others left comments in “Mobile dashboard”…', accountId:'wx-lin', category:'通知', time:'09:48', unread:true, starred:false },
  { id:'3', sender:'招商银行', senderInitial:'招', senderColor:'#d85858', subject:'您的八月信用卡电子账单', preview:'本期应还金额 ¥4,281.70，还款日为 2026 年 9 月 9 日…', accountId:'wx-life', category:'账单', time:'昨天', unread:true, starred:false },
  { id:'4', sender:'Notion', senderInitial:'N', senderColor:'#252a28', subject:'Workspace activity summary', preview:'Here is what your team accomplished this week in 星野设计…', accountId:'wx-team', category:'订阅', time:'昨天', unread:false, starred:false },
  { id:'5', sender:'陈屿', senderInitial:'陈', senderColor:'#2e9e89', subject:'Re: 秋季发布会视觉方案', preview:'第二版的色彩方向很好，我在源文件里补充了三个修改建议…', accountId:'wx-team', category:'工作', time:'周五', unread:false, starred:true },
  { id:'6', sender:'少数派', senderInitial:'少', senderColor:'#df5967', subject:'本周效率工具精选 Vol. 128', preview:'本周我们体验了 12 款新工具，这是最值得关注的 5 款…', accountId:'wx-life', category:'订阅', time:'周四', unread:false, starred:false },
  { id:'7', sender:'腾讯企业邮', senderInitial:'邮', senderColor:'#388fd1', subject:'安全提醒：新增登录设备', preview:'您的邮箱于上海市在一台新设备上登录，如非本人操作…', accountId:'wx-lin', category:'通知', time:'周三', unread:false, starred:false },
  { id:'8', sender:'王安', senderInitial:'王', senderColor:'#b77d42', subject:'项目报价单已更新', preview:'已经按昨晚确认的范围更新报价和排期，请查收附件…', accountId:'wx-lin', category:'工作', time:'8月19日', unread:false, starred:false },
];
const categoryColors: Record<string,string> = { 工作:'blue', 订阅:'purple', 账单:'orange', 通知:'cyan' };

function MailDashboard() {
  const { message } = App.useApp();
  const [accountFilter,setAccountFilter]=useState('all');
  const [category,setCategory]=useState('all');
  const [status,setStatus]=useState('all');
  const [search,setSearch]=useState('');
  const [qrOpen,setQrOpen]=useState(false);
  const [accountRows,setAccountRows]=useState<Account[]>(demoAccounts);
  const [mailRows,setMailRows]=useState<MailItem[]>(demoMails);
  const [qrValue,setQrValue]=useState('https://yunyouhe.local/wechat/demo-authorize');
  useEffect(()=>{fetch('/api/dashboard').then(r=>r.ok?r.json():Promise.reject()).then(data=>{
    setAccountRows(data.accounts.map((a:{id:string;name:string;email:string;unread:number;color:string})=>({...a,unread:Number(a.unread),initials:a.name.slice(0,1)})));
    setMailRows(data.emails.map((m:{id:string;sender:string;subject:string;preview:string;accountId:string;category:MailItem['category'];receivedAt:number;isRead:number;isStarred:number},i:number)=>({...m,senderInitial:m.sender.slice(0,1),senderColor:['#5d78d6','#9b68c6','#d85858','#252a28','#2e9e89'][i%5],time:i<2?['10:32','09:48'][i]:i<4?'昨天':'8月'+(22-i)+'日',unread:!Boolean(m.isRead),starred:Boolean(m.isStarred)})));
  }).catch(()=>undefined)},[]);
  useEffect(()=>{if(!qrOpen)return;fetch('/api/wechat/qr',{method:'POST'}).then(r=>r.json()).then(data=>setQrValue(data.qrUrl)).catch(()=>undefined)},[qrOpen]);
  const filtered=useMemo(()=>mailRows.filter(mail=>{const q=search.trim().toLowerCase();return(accountFilter==='all'||mail.accountId===accountFilter)&&(category==='all'||mail.category===category)&&(status==='all'||(status==='unread'?mail.unread:mail.starred))&&(!q||`${mail.sender}${mail.subject}${mail.preview}`.toLowerCase().includes(q))}),[accountFilter,category,status,search,mailRows]);
  const account=(id:string)=>accountRows.find(item=>item.id===id)!;
  const columns:TableColumnsType<MailItem>=[
    {title:'发件人',dataIndex:'sender',width:180,render:(_,row)=><div className="sender-cell"><Avatar size={30} style={{background:row.senderColor,fontSize:12}}>{row.senderInitial}</Avatar><span className="sender">{row.sender}</span></div>},
    {title:'主题与摘要',dataIndex:'subject',render:(_,row)=><div className="subject-line"><span className="subject">{row.subject}</span><span className="preview">— {row.preview}</span></div>},
    {title:'类型',dataIndex:'category',width:82,render:value=><Tag color={categoryColors[value]} bordered={false}>{value}</Tag>},
    {title:'微信账号',dataIndex:'accountId',width:150,render:value=>{const item=account(value);return <Tag className="wechat-tag" style={{background:`${item.color}13`,color:item.color}}><span className="tag-dot" style={{background:item.color}}/>{item.name.replace('林墨 · ','')}</Tag>}},
    {title:'时间',dataIndex:'time',width:82,render:value=><span style={{color:'#929995',fontSize:11}}>{value}</span>},
    {title:'',key:'actions',width:76,render:(_,row)=><Space size={4}><Tooltip title={row.starred?'取消星标':'添加星标'}><Button type="text" size="small" icon={row.starred?<StarFilled style={{color:'#f4aa28'}}/>:<StarOutlined/>}/></Tooltip><Button type="text" size="small" icon={<MoreOutlined/>}/></Space>},
  ];
  const accountMenu:MenuProps['items']=accountRows.map(item=>({key:item.id,label:item.name}));
  return <div className="mail-app"><Layout className="mail-shell">
    <Sider width={236} className="mail-sider"><div className="brand"><span className="brand-mark"><MailOutlined/></span><span className="brand-name">云邮盒</span></div>
      <Menu className="nav-menu" mode="inline" selectedKeys={['inbox']} items={[
        {key:'inbox',icon:<InboxOutlined/>,label:<span>统一收件箱 <Badge count={20} color="#17b26a" size="small" style={{marginLeft:26}}/></span>},
        {key:'starred',icon:<StarOutlined/>,label:'星标邮件'},{key:'sent',icon:<SendOutlined/>,label:'已发送'},{key:'contacts',icon:<TeamOutlined/>,label:'联系人'},
      ]}/><div className="sider-label">微信账号</div><div className="account-list">{accountRows.map(item=><div key={item.id} className={`account-chip ${accountFilter===item.id?'active':''}`} onClick={()=>setAccountFilter(item.id)}><Badge dot status="success"><Avatar size={32} style={{background:item.color,fontSize:12}}>{item.initials}</Avatar></Badge><div style={{minWidth:0}}><div className="account-name">{item.name}</div><div className="account-email">{item.email}</div></div><span className="account-count">{item.unread}</span></div>)}</div>
      <div className="add-account" onClick={()=>setQrOpen(true)}><PlusOutlined/>&nbsp; 扫码添加微信</div><div className="side-footer"><SettingOutlined/>&nbsp; 设置与数据同步</div>
    </Sider>
    <Layout className="main-layout"><Header className="topbar"><div><div className="breadcrumb-title">收件箱</div><div className="breadcrumb-sub">所有微信账号 · 实时同步</div></div><div className="header-actions"><Input className="global-search" allowClear value={search} onChange={e=>setSearch(e.target.value)} prefix={<SearchOutlined style={{color:'#a4aba7'}}/>} placeholder="搜索发件人、主题或正文"/><Tooltip title="通知"><Badge dot><Button shape="circle" icon={<BellOutlined/>}/></Badge></Tooltip><div className="user-pill"><Avatar size={31} style={{background:'#20332a'}}>LM</Avatar><span style={{fontSize:12,fontWeight:650}}>林墨</span><DownOutlined style={{fontSize:9,color:'#999'}}/></div></div></Header>
      <Content className="main-content"><div className="hero-row"><div><h1>上午好，林墨</h1><p>3 个微信账号已连接，今天有 20 封未读邮件。</p></div><Button type="primary" icon={<QrcodeOutlined/>} onClick={()=>setQrOpen(true)}>添加微信账号</Button></div>
        <div className="stat-row"><div className="stat-card"><div className="stat-label">全部邮件</div><div className="stat-value">1,248 <span className="stat-trend">+32 本周</span></div></div><div className="stat-card"><div className="stat-label">未读邮件</div><div className="stat-value">20 <span className="stat-trend">需处理</span></div></div><div className="stat-card"><div className="stat-label">已连接微信</div><div className="stat-value">3 <span className="stat-trend">全部在线</span></div></div><div className="stat-card"><div className="stat-label">今日同步</div><div className="stat-value">46 <span className="stat-trend">刚刚更新</span></div></div></div>
        <section className="mail-card"><div className="toolbar"><div className="filter-group"><Select className="filter-select" value={accountFilter} onChange={setAccountFilter} options={[{value:'all',label:'全部微信账号'},...accountRows.map(a=>({value:a.id,label:a.name}))]}/><Select value={category} onChange={setCategory} options={[{value:'all',label:'全部类型'},{value:'工作',label:'工作'},{value:'订阅',label:'订阅'},{value:'账单',label:'账单'},{value:'通知',label:'通知'}]}/><Select value={status} onChange={setStatus} options={[{value:'all',label:'全部状态'},{value:'unread',label:'仅未读'},{value:'starred',label:'仅星标'}]}/><span style={{fontSize:11,color:'#9ba19e'}}>共 {filtered.length} 封</span></div><Space><Tooltip title="同步邮件"><Button icon={<ReloadOutlined/>} onClick={()=>message.success('邮箱已是最新状态')}/></Tooltip><Dropdown menu={{items:accountMenu}}><Button>批量操作 <DownOutlined/></Button></Dropdown></Space></div><Table className="mail-table" rowKey="id" rowSelection={{}} columns={columns} dataSource={filtered} pagination={{pageSize:7,showSizeChanger:false,position:['bottomRight']}} rowClassName={row=>row.unread?'unread-row':''} scroll={{x:860}}/></section>
      </Content></Layout>
  </Layout>
  <Modal className="qr-modal" open={qrOpen} onCancel={()=>setQrOpen(false)} footer={null} width={420} centered><div className="qr-modal-head"><h2><WechatFilled style={{color:'#17b26a',marginRight:9}}/>连接新的微信账号</h2><p>使用微信扫一扫，授权后即可同步该账号绑定的邮箱。</p></div><div className="qr-body"><div className="qr-frame"><QRCodeSVG value={qrValue} size={172} level="H"/><div className="qr-logo"><WechatFilled/></div></div><div className="qr-status"><Badge status="processing"/> 等待微信扫码</div><div className="qr-help">二维码将在 4:52 后失效</div><div className="security-note"><CheckCircleFilled style={{color:'#16a765'}}/> 授权凭证将加密保存，你可以随时在账号设置中解除连接。</div></div></Modal>
  </div>;
}

export default function Home(){return <ConfigProvider theme={{token:{colorPrimary:'#17b26a',borderRadius:9,colorText:'#26302b',colorBorder:'#e7ece9',fontSize:13},components:{Button:{primaryShadow:'none'},Table:{headerBg:'#fbfcfb'}}}}><App><MailDashboard/></App></ConfigProvider>}
