(() => {
    const page = document.body.dataset.portalPage || 'dashboard';
    const menu = [
        ['dashboard', 'Dashboard', 'fa-gauge-high', 'portal.html'],
        ['wallet', 'Wallet & Funding', 'fa-wallet', 'portal-wallet.html'],
        ['transactions', 'Transactions', 'fa-receipt', 'portal-transactions.html'],
        ['settings', 'Account Settings', 'fa-user-gear', 'portal-settings.html'],
        ['services', 'Verification Services', 'fa-shield-halved', 'portal-services.html'],
        ['history', 'Verification History', 'fa-list-check', 'portal-history.html'],
        ['pins', 'Exam PIN Orders', 'fa-graduation-cap', 'portal-exam-pins.html']
    ];
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money = n => '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });
    const date = value => value ? new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
    const content = document.getElementById('portalContent');
    const sidebar = document.getElementById('portalSidebarMount');

    sidebar.innerHTML = `
        <button type="button" class="rail-toggle" id="portalRailToggle" aria-expanded="false" aria-controls="portalShortcuts"><i class="fa-solid fa-bars"></i> Account Menu</button>
        <button type="button" class="rail-backdrop" id="railBackdrop" hidden aria-label="Close account menu"></button>
        <nav class="service-shortcuts" id="portalShortcuts" aria-label="Account shortcuts">
            <div class="rail-user"><div class="rail-avatar" id="railAvatar" style="display:grid;place-items:center;font-size:27px;font-weight:700;color:#fff;background:var(--brand)">M</div><h3 class="rail-name" id="railUserName">Customer</h3><div class="rail-wallet">Wallet: <strong class="rail-badge" id="railWalletBalance">…</strong></div></div>
            ${menu.map(([key,label,icon,url],i) => `${i===1?'<div class="rail-header-label">Account</div>':''}${i===4?'<div class="rail-header-label">Services</div>':''}<a class="rail-item ${page===key?'is-active':''}" href="${url}" ${page===key?'aria-current="page"':''}><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${label}</span></a>`).join('')}
            <div class="rail-footer-links"><a class="rail-item" href="fund-wallet.html"><i class="fa-solid fa-building-columns"></i><span>Fund Wallet</span></a><a class="rail-item" href="portal-services.html"><i class="fa-solid fa-id-card"></i><span>New Verification</span></a><button type="button" class="rail-logout" id="railLogout"><i class="fa-solid fa-right-from-bracket"></i><span>Sign Out</span></button></div>
        </nav>`;

    const descriptions = {
        dashboard: `<section class="dashboard-header"><div class="user-greeting"><div class="user-avatar" id="portalInitial">M</div><div class="user-meta"><h1>Welcome, <span id="portalName">Customer</span></h1><p><span id="portalEmail">—</span><span id="portalPhone">—</span></p></div></div><div class="header-actions"><a href="portal-wallet.html" class="hdr-btn hdr-btn-primary"><i class="fa-solid fa-wallet"></i> Wallet &amp; Funding</a></div></section>
            <h2 class="portal-section-title">Wallet balance</h2><section class="dash-cards-row"><article class="dash-card"><div class="dash-card-title">Available balance</div><div class="dash-card-val" id="walletBalance">—</div><div class="dash-card-sub" id="walletSub">Loading your wallet…</div><div class="dash-card-actions"><a class="v-btn v-btn-copy" href="portal-wallet.html">Wallet details</a><a class="v-btn v-btn-copy" href="fund-wallet.html">Fund wallet</a></div></article></section>
            <h2 class="portal-section-title">Go to a section</h2><section class="portal-service-menu">${menu.slice(1).map(([key,label,icon,url])=>`<a class="portal-service-toggle" href="${url}"><span class="cat-icon-wrap nin"><i class="fa-solid ${icon}"></i></span><span>${label}</span><i class="fa-solid fa-arrow-right portal-chevron"></i></a>`).join('')}</section>`,
        wallet: `<section class="dash-cards-row"><article class="dash-card"><div class="dash-card-title">Available balance</div><div class="dash-card-val" id="walletBalance">—</div><div class="dash-card-sub" id="walletSub">Loading your wallet…</div><div class="dash-card-actions"><a href="fund-wallet.html" class="v-btn v-btn-copy">Fund wallet</a><a href="portal-transactions.html" class="v-btn v-btn-copy">Transaction history</a></div></article><article class="dash-card"><div class="dash-card-title">Dedicated Funding Account</div><div id="fundingAccount"><div class="dash-card-val dash-card-val-sm" id="fundingAccountState">Checking…</div><div class="dash-card-sub" id="fundingAccountSub">Loading your assigned account details.</div></div><div class="dash-card-actions"><a href="fund-wallet.html" class="v-btn v-btn-copy">Funding options</a></div></article></section>`,
        transactions: `<section class="tx-panel"><div class="table-scroll"><table class="ledger-table"><thead><tr><th>Reference</th><th>Description</th><th>Amount</th><th>Balance</th><th>Status</th><th>Date</th></tr></thead><tbody id="txTableBody"><tr><td colspan="6">Loading your transactions…</td></tr></tbody></table></div></section>`,
        settings: `<section class="profile-grid"><article class="profile-card"><h3>Profile details</h3><p class="pc-sub">Update the contact details used for your account.</p><div class="profile-field"><label for="profName">Full name</label><input id="profName" type="text"></div><div class="profile-field"><label for="profEmail">Email address</label><input id="profEmail" type="email" readonly></div><div class="profile-field"><label for="profPhone">Phone number</label><input id="profPhone" type="tel"></div><div class="profile-field"><label for="profAddress">Address</label><input id="profAddress" type="text"></div><button class="profile-submit" id="profileSave" type="button">Save changes</button><div id="profileNotice" class="profile-notice" role="status"></div></article><article class="profile-card"><h3>Change password</h3><p class="pc-sub">Use at least 8 characters and enter your current password.</p><form id="passwordForm" novalidate><div class="profile-field"><label for="pwCurrent">Current password</label><input id="pwCurrent" type="password" autocomplete="current-password"></div><div class="profile-field"><label for="pwNew">New password</label><input id="pwNew" type="password" autocomplete="new-password"></div><div class="profile-field"><label for="pwConfirm">Confirm new password</label><input id="pwConfirm" type="password" autocomplete="new-password"></div><button class="profile-submit" id="pwSubmit" type="submit">Update password</button><div id="pwNotice" class="profile-notice" role="status"></div></form></article></section>`,
        services: `<h2 class="portal-section-title">Available Services &amp; Pricing</h2><p class="pc-sub">Choose a service to see its required details and current price before submitting.</p><div id="serviceGroups"><p class="orders-loading">Loading available services…</p></div><section class="request-panel" id="serviceRequestPanel" hidden></section>`,
        history: `<section class="portal-orders"><p class="orders-loading" id="verifyState">Loading your verification requests…</p><div id="verifyList"></div></section>`,
        pins: `<p class="pc-sub"><a class="v-btn v-btn-copy" href="buy-pins.html">Browse exam PINs</a></p><section class="portal-orders"><p class="orders-loading" id="ordersState">Loading your orders…</p><div id="ordersList"></div></section>`
    };
    content.innerHTML = descriptions[page] || descriptions.dashboard;

    document.getElementById('portalRailToggle').addEventListener('click', () => {
        const open = !document.body.classList.contains('service-rail-open');
        document.body.classList.toggle('service-rail-open', open);
        document.getElementById('portalRailToggle').setAttribute('aria-expanded', String(open));
        document.getElementById('railBackdrop').hidden = !open;
    });
    document.getElementById('railBackdrop').addEventListener('click', () => {
        document.body.classList.remove('service-rail-open');
        document.getElementById('portalRailToggle').setAttribute('aria-expanded', 'false');
        document.getElementById('railBackdrop').hidden = true;
    });

    async function start() {
        const { data, error } = await sb.auth.getSession();
        if (error || !data?.session) { location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop())); return; }
        const user = data.session.user;
        const meta = user.user_metadata || {};
        const name = meta.full_name || meta.username || (user.email || '').split('@')[0] || 'Customer';
        const put = (id,value) => { const el=document.getElementById(id); if(el) el.value=value ?? ''; };
        const set = (id,value) => { const el=document.getElementById(id); if(el) el.textContent=value ?? ''; };
        set('railUserName',name); set('railAvatar',name.trim().slice(0,1).toUpperCase());
        set('portalName',name); set('portalEmail',user.email || '—'); set('portalPhone',meta.phone || 'Phone not added');
        put('profName',name); put('profEmail',user.email || ''); put('profPhone',meta.phone); put('profAddress',meta.address);
        try {
            const {data: wallet,error:walletError}=await sb.from('wallets').select('balance').eq('user_id',user.id).maybeSingle();
            if(walletError) throw walletError;
            const amount=money(wallet?.balance || 0); set('railWalletBalance',amount); set('walletBalance',amount);
            set('walletSub',wallet?'Live balance from your wallet account':'No wallet account has been opened yet.');
        } catch (_) { set('railWalletBalance','Unavailable'); set('walletBalance','Unavailable'); set('walletSub','Could not load your balance. Refresh to retry.'); }
        document.getElementById('portalLoading').classList.add('gone');
        document.getElementById('portalMain').classList.add('ready');
        document.getElementById('railLogout').addEventListener('click', logout);
        document.getElementById('logoutBtn')?.addEventListener('click', logout);
        document.getElementById('mobileLogout')?.addEventListener('click', e=>{e.preventDefault();logout();});
        document.getElementById('profileSave')?.addEventListener('click', async()=>{
            const notice=document.getElementById('profileNotice'); notice.className='profile-notice visible';
            const full_name=document.getElementById('profName').value.trim(), phone=document.getElementById('profPhone').value.trim(), address=document.getElementById('profAddress').value.trim();
            if(!full_name){notice.textContent='Enter your full name.';return;}
            const btn=document.getElementById('profileSave');btn.disabled=true;
            const {error:saveError}=await sb.auth.updateUser({data:{...meta,full_name,phone,address}});
            btn.disabled=false; notice.classList.add(saveError?'err':'ok'); notice.textContent=saveError?'Could not save your profile. Please try again.':'Profile updated.';
            if(!saveError){set('railUserName',full_name);set('portalName',full_name);}
        });
        document.getElementById('passwordForm')?.addEventListener('submit',async e=>{
            e.preventDefault();const notice=document.getElementById('pwNotice'),btn=document.getElementById('pwSubmit');notice.className='profile-notice visible';
            const current=document.getElementById('pwCurrent').value,next=document.getElementById('pwNew').value,confirm=document.getElementById('pwConfirm').value;
            if(!current||!next){notice.textContent='Fill in your current and new password.';return;} if(next.length<8){notice.textContent='New password must be at least 8 characters.';return;} if(next!==confirm){notice.textContent='New passwords do not match.';return;}
            btn.disabled=true;try{const auth=await sb.auth.signInWithPassword({email:user.email,password:current});if(auth.error)throw new Error('Current password is not correct.');const result=await sb.auth.updateUser({password:next});if(result.error)throw result.error;e.target.reset();notice.classList.add('ok');notice.textContent='Password updated.';}catch(err){notice.classList.add('err');notice.textContent=err.message||'Could not update password.';}finally{btn.disabled=false;}
        });
        await loadPage(user);
    }
    async function logout(){await sb.auth.signOut();location.href='login.html';}

    async function loadPage(user) {
        if(page==='wallet'){
            const {data,error}=await sb.from('payment_accounts').select('bank_name,account_number,account_name,status').eq('user_id',user.id).limit(1);
            const account=data?.[0];
            if(error){document.getElementById('fundingAccountState').textContent='Temporarily unavailable';document.getElementById('fundingAccountSub').textContent='Could not read funding account details.';return;}
            if(!account){document.getElementById('fundingAccountState').textContent='No assigned account';document.getElementById('fundingAccountSub').textContent='A personal virtual account will appear here if a payment provider assigns one. Use Funding options to see current ways to add funds.';return;}
            document.getElementById('fundingAccount').innerHTML=`<div class="funding-account">${[['Bank',account.bank_name],['Account number',account.account_number],['Account name',account.account_name]].filter(([,v])=>v).map(([k,v])=>`<div class="funding-account-row"><span><span class="fa-label">${esc(k)}</span><span class="fa-value">${esc(v)}</span></span><button class="fa-copy" type="button" data-copy="${esc(v)}" aria-label="Copy ${esc(k)}">Copy</button></div>`).join('')}</div><p class="funding-warning">Only use account details shown here for your own profile.</p>`;
            document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>navigator.clipboard?.writeText(b.dataset.copy));
        }
        if(page==='transactions') await loadTransactions(user);
        if(page==='services') await loadServices();
        if(page==='history') await loadHistory(user);
        if(page==='pins') await loadPinOrders(user);
    }
    async function loadTransactions(user){
        const body=document.getElementById('txTableBody');let result=await sb.from('wallet_transactions').select('reference,amount,balance_before,balance_after,status,type,description,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);
        if(result.error) result=await sb.from('wallet_transactions').select('reference,amount,status,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);
        const {data,error}=result;
        if(error){body.innerHTML='<tr><td colspan="6">Could not load transactions. Refresh to retry.</td></tr>';return;}if(!data?.length){body.innerHTML='<tr><td colspan="6">No transactions yet.</td></tr>';return;}
        body.innerHTML=data.map(t=>{const type=String(t.type||'').toLowerCase(),debit=type==='service'||/debit|charge|purchase|payment/i.test(type)||Number(t.amount)<0;const status=String(t.status||'pending').toLowerCase();const label={completed:'Completed',approved:'Completed',successful:'Completed',pending:'Pending',processing:'Processing',failed:'Failed',rejected:'Failed',refunded:'Refunded'}[status]||esc(status);const balance=t.balance_before!=null&&t.balance_after!=null?`${money(t.balance_before)} → ${money(t.balance_after)}`:'—';return `<tr><td class="tx-ref" data-label="Reference">${esc(t.reference||'—')}</td><td data-label="Description">${esc(t.description||type||'Wallet transaction')}</td><td class="tx-amt ${debit?'debit':'credit'}" data-label="Amount">${debit?'−':'+'}${money(Math.abs(Number(t.amount)||0))}</td><td data-label="Balance">${balance}</td><td data-label="Status">${label}</td><td class="tx-date" data-label="Date">${date(t.created_at)}</td></tr>`}).join('');
    }
    /* Category identity for the pricing cards: accent colour + icon. */
    const CATEGORIES={
        nin:{title:'NIN Verification',icon:'fa-id-card'},
        bvn:{title:'BVN Verification',icon:'fa-building-columns'},
        cac:{title:'C.A.C Registration',icon:'fa-briefcase'},
        exam:{title:'Exam PINs',icon:'fa-graduation-cap'}
    };
    /* One icon per service so the cards are scannable at a glance. */
    const SERVICE_ICONS={
        nin_search:'fa-id-card',nin_search_v3:'fa-id-card',nin_search_v4:'fa-id-card',nin_search_v5:'fa-id-card',
        nin_by_phone:'fa-mobile-screen-button',nin_by_phone_v3:'fa-mobile-screen-button',
        nin_ipe_clearance:'fa-shield-halved',
        bvn_search:'fa-building-columns',bvn_by_phone:'fa-mobile-screen-button',bvn_modification:'fa-user-pen',
        cac_business_name:'fa-briefcase',cac_company_ltd:'fa-building',cac_organization_registration:'fa-users',
        jamb_pin_profile:'fa-graduation-cap'
    };
    async function loadServices(){
        const root=document.getElementById('serviceGroups');
        let result=await sb.from('verify_services').select('code,name,category,price,active,description').eq('active',true);
        if(result.error) result=await sb.from('verify_services').select('code,name,price,active,description').eq('active',true);
        if(result.error) result=await sb.from('verify_services').select('code,name,price,active').eq('active',true);
        const {data,error}=result;
        if(error){root.innerHTML='<p class="orders-empty">Services are temporarily unavailable. Refresh to retry.</p>';return;}
        const allowed={nin:['nin_by_phone','nin_search','nin_search_v3','nin_search_v4','nin_search_v5','nin_by_phone_v3','nin_ipe_clearance'],bvn:['bvn_search','bvn_by_phone','bvn_modification'],cac:['cac_business_name','cac_company_ltd','cac_organization_registration'],exam:['jamb_pin_profile']};
        const names={nin_by_phone:'NIN By Phone',nin_search:'NIN Verification',nin_search_v3:'NIN Verification V3',nin_search_v4:'NIN Search V4',nin_search_v5:'NIN Verification V5',nin_by_phone_v3:'NIN By Phone V3',nin_ipe_clearance:'IPE Clearance / Tracking ID Services',bvn_search:'BVN Verification',bvn_by_phone:'BVN Retrieval by Phone',bvn_modification:'BVN Modification',cac_business_name:'CAC Business Name Registration',cac_company_ltd:'CAC Limited Company Registration',cac_organization_registration:'CAC Organization Registration'};
        const groups=[];
        for(const [cat,codes] of Object.entries(allowed)){
            const rows=(data||[]).filter(s=>codes.includes(s.code));
            if(cat==='exam'){
                const pins=await sb.from('pin_products').select('id,exam,name,price').eq('active',true).order('price');
                const products=pins.error?[]:(pins.data||[]);
                const cards=products.map(pinCard).concat(rows.map(s=>serviceCard(s,names[s.code]||s.name,cat)));
                if(!cards.length&&!pins.error)continue;
                const foot=(pins.error?'<p class="svc-group-note">Product pricing could not be loaded. Visit the PIN shop to retry.</p>':'')
                    +(cards.length?'<a class="svc-group-foot" href="buy-pins.html">Open PIN shop<i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>':'');
                groups.push(serviceGroup(cat,cards,foot));
                continue;
            }
            if(!rows.length)continue;
            groups.push(serviceGroup(cat,rows.map(s=>serviceCard(s,names[s.code]||s.name,cat))));
        }
        root.innerHTML=groups.join('')||'<p class="orders-empty">No services are currently available.</p>';
        await openServiceRequest(data||[]);
    }
    /* The service card is one component for every service: icon, name, what it
       does, the live price and the action that opens the request form. */
    function serviceCard(service,name,cat){
        const meta=CATEGORIES[cat]||{icon:'fa-shield-halved'};
        const icon=SERVICE_ICONS[service.code]||meta.icon;
        const price=Number(service.price)||0;
        return `<a class="svc-card" data-cat="${cat}" href="portal-services.html?service=${encodeURIComponent(service.code)}#serviceRequestPanel">`
            +`<span class="svc-card-icon" aria-hidden="true"><i class="fa-solid ${icon}"></i></span>`
            +`<h3 class="svc-card-title">${esc(name)}</h3>`
            +`<p class="svc-card-desc">${esc(service.description||service.name)}</p>`
            +`<span class="svc-card-foot"><span class="svc-card-price${price?'':' is-request'}">${price?money(price):'Price on request'}</span>`
            +`<span class="svc-card-cta">Start request<i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span></span></a>`;
    }
    function pinCard(product){
        const exam=String(product.exam||'').trim();
        return `<a class="svc-card" data-cat="exam" href="buy-pins.html?product=${encodeURIComponent(product.id)}">`
            +`<span class="svc-card-icon" aria-hidden="true"><i class="fa-solid fa-graduation-cap"></i></span>`
            +`<h3 class="svc-card-title">${esc(product.name||exam||'Exam PIN')}</h3>`
            +`<p class="svc-card-desc">Exam PIN for ${esc(exam||'your exam')}.</p>`
            +`<span class="svc-card-foot"><span class="svc-card-price">${money(product.price)}</span>`
            +`<span class="svc-card-cta">View product<i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span></span></a>`;
    }
    function serviceGroup(cat,cards,foot){
        const meta=CATEGORIES[cat]||{title:'Services',icon:'fa-shield-halved'};
        const count=cards.length;
        const sub=count?`${count} service${count===1?'':'s'} available`:'Pricing temporarily unavailable';
        return `<section class="svc-group" data-cat="${cat}">`
            +`<header class="svc-group-head"><span class="svc-group-icon" aria-hidden="true"><i class="fa-solid ${meta.icon}"></i></span>`
            +`<div class="svc-group-headings"><h2 class="svc-group-title">${esc(meta.title)}</h2>`
            +`<p class="svc-group-sub">${sub}</p></div></header>`
            +`<div class="svc-grid">${cards.join('')}</div>${foot||''}</section>`;
    }
    async function openServiceRequest(services){
        const panel=document.getElementById('serviceRequestPanel');
        const code=new URLSearchParams(location.search).get('service');
        if(!code)return;
        const service=services.find(item=>item.code===code);
        if(!service){panel.hidden=false;panel.innerHTML='<p class="orders-empty">This service is unavailable right now. Choose an available service from the list.</p>';return;}
        const fieldSpecs={
            nin_by_phone:[['inputPhoneLookup','Registered phone number','tel','required']],nin_search:[['inputNin','NIN','text','required']],nin_search_v3:[['inputNin','NIN','text','required'],['inputSlipType','Slip type','select:Improved Slip|Premium Slip','required']],nin_search_v4:[['inputNin','NIN','text','required'],['inputSlipType','Slip type','select:Regular Slip|Improved Slip|Premium Slip|vNIN Verification Slip','required']],nin_search_v5:[['inputNin','NIN','text','required'],['inputSlipType','Slip type','select:Regular Slip|Improved Slip|Premium Slip|vNIN Slip','required']],nin_by_phone_v3:[['inputPhoneLookup','Registered phone number','tel','required'],['inputSlipType','Slip type','select:Improved Slip|Premium Slip','required']],nin_ipe_clearance:[['inputTrackingId','Tracking ID','text','required'],['inputCenter','Enrolment centre','text','required'],['inputEnrolYear','Enrolment year','number','']],bvn_search:[['inputBvn','BVN','text','required']],bvn_by_phone:[['inputPhoneLookup','Registered phone number','tel','required'],['inputNetwork','Network','select:MTN|Airtel|Glo|9mobile','required']],bvn_modification:[['inputBvn','BVN','text','required']],cac_business_name:[['inputCacName1','Proposed business name 1','text','required'],['inputCacName2','Proposed business name 2','text','required']],cac_company_ltd:[['inputCacName1','Proposed company name 1','text','required'],['inputCacName2','Proposed company name 2','text','required']],cac_organization_registration:[['inputCacName1','Proposed organization name 1','text','required'],['inputCacName2','Proposed organization name 2','text','required']],jamb_pin_profile:[['inputJambProfile','JAMB profile phone number','tel','required'],['inputJambEmail','Email address','email','required']]
        };
        const fields=fieldSpecs[code]||[];
        const fieldHtml=fields.map(([id,label,type,required])=>{const requiredAttr=required?'required':'';const control=type.startsWith('select:')?`<select id="${id}" ${requiredAttr}><option value="">Choose ${esc(label.toLowerCase())}</option>${type.slice(7).split('|').map(option=>`<option>${esc(option)}</option>`).join('')}</select>`:`<input id="${id}" type="${type}" ${requiredAttr} ${['inputNin','inputBvn'].includes(id)?'maxlength="11" inputmode="numeric"':''}>`;return `<label class="request-field"><span>${esc(label)}${required?' *':''}</span>${control}</label>`}).join('');
        panel.hidden=false;
        panel.innerHTML=`<div class="request-heading"><div><h2>${esc(service.name)}</h2><p>${esc(service.description||'Enter the required details to submit this request for review.')}</p></div><strong>${Number(service.price)>0?money(service.price):'Price on request'}</strong></div><form id="portalVerifyForm" novalidate><div class="request-fields">${fieldHtml}</div><p class="request-note">Your request will be reviewed by our team. Submitting does not debit your wallet or return an instant verification result.</p><div class="request-actions"><button class="profile-submit" id="portalVerifySubmit" type="submit">Submit for review</button><a class="v-btn v-btn-copy" href="portal-history.html">View request history</a></div><div class="profile-notice" id="portalVerifyNotice" role="status"></div></form>`;
        panel.scrollIntoView({behavior:'smooth',block:'start'});
        document.getElementById('portalVerifyForm').addEventListener('submit',async event=>{
            event.preventDefault();const notice=document.getElementById('portalVerifyNotice'),button=document.getElementById('portalVerifySubmit');notice.className='profile-notice visible';
            const inputParams={};for(const [id] of fields){const element=document.getElementById(id);inputParams[id]=element?.value.trim()||'';if(element?.required&&!inputParams[id]){notice.classList.add('err');notice.textContent='Please complete all required fields.';element.focus();return;}}
            const nin=inputParams.inputNin,bvn=inputParams.inputBvn,phone=inputParams.inputPhoneLookup;
            if(nin&&!/^\d{11}$/.test(nin)){notice.classList.add('err');notice.textContent='NIN must be exactly 11 digits.';return;}if(bvn&&!/^\d{11}$/.test(bvn)){notice.classList.add('err');notice.textContent='BVN must be exactly 11 digits.';return;}if(phone&&!/^(\+?234|0)[789][01]\d{8}$/.test(phone.replace(/\s/g,''))){notice.classList.add('err');notice.textContent='Enter a valid Nigerian phone number.';return;}
            const {data:sessionData,error:sessionError}=await sb.auth.getSession(),customer=sessionData?.session?.user;if(sessionError||!customer){location.replace('login.html?next='+encodeURIComponent('portal-services.html?service='+code));return;}
            const metadata=customer.user_metadata||{},customerName=String(metadata.full_name||metadata.name||'').trim(),customerPhone=String(metadata.phone||metadata.phone_number||'').trim().replace(/[\s-]/g,'');if(!customerName||!customerPhone){notice.classList.add('err');notice.textContent='Add your full name and phone number in Account Settings before submitting.';return;}
            if(!window.confirm(`Submit ${service.name} for review?\n\nRequest price: ${Number(service.price)>0?money(service.price):'Price on request'}\n\nNo wallet charge is made. Our team will review the request and contact you about payment and processing.`))return;
            button.disabled=true;button.textContent='Submitting…';
            try{const {data:liveService,error:serviceError}=await sb.from('verify_services').select('id,name,price,active').eq('code',code).eq('active',true).single();if(serviceError||!liveService)throw new Error('This service is no longer available.');
                const requestCode='VR-'+crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase(),lookup=inputParams.inputNin||inputParams.inputBvn||inputParams.inputPhoneLookup||inputParams.inputTrackingId||inputParams.inputCacName1||inputParams.inputJambProfile||Object.values(inputParams)[0]||'';
                const payload={request_code:requestCode,user_id:customer.id,user_email:customer.email,service_id:liveService.id,lookup_value:lookup,customer_name:customerName,customer_phone:customerPhone,status:'pending'};
                const probe=await sb.from('verify_requests').select('extra_details').limit(1);if(!probe.error)payload.extra_details=JSON.stringify(Object.fromEntries(Object.entries(inputParams).filter(([key])=>!['inputNin','inputBvn','inputPhoneLookup'].includes(key))));
                let inserted=await sb.from('verify_requests').insert(payload);if(inserted.error&&payload.extra_details&&/extra_details/i.test(inserted.error.message||'')){delete payload.extra_details;inserted=await sb.from('verify_requests').insert(payload);}if(inserted.error)throw inserted.error;
                panel.innerHTML=`<div class="request-success"><span class="cat-icon-wrap nin"><i class="fa-solid fa-check"></i></span><h2>Request submitted</h2><p>${esc(liveService.name)} was submitted for review. No wallet charge was made.</p><p>Request reference: <strong>${esc(requestCode)}</strong></p><a class="profile-submit" href="portal-history.html">View verification history</a></div>`;
            }catch(error){notice.classList.add('err');notice.textContent=error.message||'Could not submit this request. Please try again.';button.disabled=false;button.textContent='Submit for review';}
        });
    }
    async function loadHistory(user){
        const state=document.getElementById('verifyState'),list=document.getElementById('verifyList');const {data,error}=await sb.from('verify_requests').select('request_code,service_name,lookup_value,amount,status,result_text,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50);
        if(error){state.textContent='Could not load verification history. Refresh to retry.';return;}if(!data?.length){state.textContent='No verification requests yet.';return;}state.remove();list.innerHTML=data.map(v=>`<article class="order-item"><div><b>${esc(v.service_name)}</b><small class="tx-date">${esc(v.request_code||'—')} · ${date(v.created_at)} · ${esc(v.lookup_value||'')}</small></div><strong>${money(v.amount)}</strong><span class="order-status ${esc(v.status)}">${esc(v.status)}</span>${v.status==='approved'&&v.result_text?`<pre class="verify-result">${esc(v.result_text)}</pre>`:''}</article>`).join('');
    }
    async function loadPinOrders(user){
        const state=document.getElementById('ordersState'),list=document.getElementById('ordersList');const {data,error}=await sb.from('pin_orders').select('order_code,product_name,quantity,amount,status,delivered_codes,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50);
        if(error){state.textContent='Could not load exam PIN orders. Refresh to retry.';return;}if(!data?.length){state.textContent='No PIN orders yet. Use Browse exam PINs to see available products.';return;}state.remove();list.innerHTML=data.map(o=>`<article class="order-item"><div><b>${esc(o.product_name||'Exam PIN')} × ${esc(o.quantity)}</b><small class="tx-date">${esc(o.order_code||'—')} · ${date(o.created_at)}</small></div><strong>${money(o.amount)}</strong><span class="order-status ${esc(o.status)}">${esc(o.status)}</span>${o.status==='approved'&&o.delivered_codes?`<pre class="verify-result">${esc(o.delivered_codes)}</pre>`:''}</article>`).join('');
    }

    start().catch(()=>{document.getElementById('portalLoading').textContent='Could not load your account. Refresh to try again.';});
})();
