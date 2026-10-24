import"./modulepreload-polyfill-Dezn_h7o.js";document.addEventListener(`DOMContentLoaded`,()=>{let e=document.getElementById(`app`);if(!e)return;e.innerHTML=`
    <div class="header-bar">
      <div class="brand">
        <span class="brand-icon">🛡️</span>
        <span class="brand-title">SecureBrowse</span>
      </div>
      <label class="switch">
        <input type="checkbox" id="chk-popup-protection" checked>
        <span class="slider"></span>
      </label>
    </div>

    <!-- Active website card -->
    <section class="site-card">
      <div class="section-title">🌐 Current Website</div>
      <div class="site-title" id="lbl-site-title">Loading tab...</div>
      <div class="site-url" id="lbl-site-url">...</div>
    </section>

    <!-- Threat Score Circular Gauge -->
    <section class="score-card">
      <div class="section-title">🛡️ Safety Rating</div>
      <div class="score-box">
        <div class="gauge-container">
          <svg class="gauge-svg">
            <circle class="gauge-bg" cx="45" cy="45" r="40" />
            <circle class="gauge-value" id="gauge-progress" cx="45" cy="45" r="40" />
          </svg>
          <div class="gauge-text">
            <span class="gauge-score" id="lbl-score">--</span>
            <span class="gauge-label">Score</span>
          </div>
        </div>
        <div class="status-info">
          <div class="status-badge" id="lbl-status">Scanning...</div>
          <div class="status-desc" id="lbl-status-desc">Analyzing URL lexical patterns, SSL status, and threat feeds...</div>
        </div>
      </div>
    </section>

    <!-- Block Statistics -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Ads Blocked</div>
        <div class="stat-value" id="lbl-ads-blocked">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Redirects Stopped</div>
        <div class="stat-value" id="lbl-redirects-blocked">0</div>
      </div>
    </div>

    <!-- Quick Navigation Menu -->
    <div class="actions-menu">
      <button class="btn btn-primary" id="btn-open-options">⚙️ Control Center & History</button>
      <button class="btn btn-secondary" id="btn-open-dashboard">📊 Web Analytics Dashboard</button>
    </div>
  `;let t=document.getElementById(`chk-popup-protection`),n=document.getElementById(`lbl-site-title`),r=document.getElementById(`lbl-site-url`),i=document.getElementById(`gauge-progress`),a=document.getElementById(`lbl-score`),o=document.getElementById(`lbl-status`),s=document.getElementById(`lbl-status-desc`),c=document.getElementById(`lbl-ads-blocked`),l=document.getElementById(`lbl-redirects-blocked`),u=document.getElementById(`btn-open-options`),d=document.getElementById(`btn-open-dashboard`);chrome.storage.local.get([`settings`,`stats`],e=>{e.settings&&(t.checked=e.settings.protectionEnabled!==!1),e.stats&&(c.textContent=(e.stats.adsBlocked||0).toLocaleString(),l.textContent=(e.stats.redirectsBlocked||0).toLocaleString())}),t.addEventListener(`change`,()=>{chrome.storage.local.get(`settings`,e=>{let n=e.settings||{};n.protectionEnabled=t.checked,chrome.storage.local.set({settings:n})})});function f(e){let t=e,n=!1;try{let r=new URL(e);t=r.hostname,n=r.protocol===`https:`}catch{}let r=t.replace(`www.`,``),i=[`.xyz`,`.top`,`.zip`,`.click`,`.country`,`.gq`,`.cf`,`.tk`,`.ml`,`.fit`,`.buzz`].some(e=>r.endsWith(e)),a=[`login`,`signin`,`verify`,`secure`,`update`,`banking`,`wallet`,`account`,`claim`,`reward`].some(t=>e.toLowerCase().includes(t)),o=[`1xbet`,`1x-`,`winprizes`,`luckyjet`,`aviator`,`jackpot`,`lottery`,`spinwheel`,`spin-win`,`promocode`,`free-bonus`,`claim-reward`,`claim-bonus`,`casino`,`betting`].some(t=>e.toLowerCase().includes(t)),s=0,c=[];if(n?c.push(`Secure connection verified (Local heuristic)`):(s+=30,c.push(`Insecure connection: URL uses HTTP protocol (Local heuristic)`)),i){s+=40;let e=r.split(`.`).pop();c.push(`Suspicious top-level domain extension (.${e}) (Local heuristic)`)}return a&&(s+=20,c.push(`Sensitive keyword detected in address (Local heuristic)`)),o&&(s=Math.max(s,75),c.push(`Potential phishing/gambling scam detected via domain keywords (Local heuristic)`)),{risk_score:Math.min(s,100),status:s>=70?`DANGEROUS`:s>=30?`SUSPICIOUS`:`SAFE`,reasons:c}}chrome.tabs.query({active:!0,lastFocusedWindow:!0},e=>{let t=e[0];if(!t||!t.url){n.textContent=`No active tab`,r.textContent=`Cannot scan this page.`,p(0,`SAFE`);return}let i=t.url,a=i;try{a=new URL(i).hostname,a.startsWith(`www.`)&&(a=a.substring(4))}catch{}if(n.textContent=t.title||`Web Page`,r.textContent=a,i.startsWith(`chrome://`)||i.startsWith(`chrome-extension://`)||i.startsWith(`about:`)){n.textContent=`Browser System Page`,r.textContent=`System Pages are secure`,p(0,`SAFE`),s.textContent=`SecureBrowse does not scan internal browser system pages.`;return}let o=new AbortController,c=setTimeout(()=>{o.abort()},2500);fetch(`http://127.0.0.1:8000/analyze`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({url:i}),signal:o.signal}).then(e=>{if(clearTimeout(c),!e.ok)throw Error(`HTTP ${e.status}`);return e.json()}).then(e=>{p(e.risk_score,e.status),e.reasons&&e.reasons.length>0&&(s.textContent=e.reasons[0])}).catch(e=>{clearTimeout(c),console.warn(`Direct scanner fetch failed or timed out. Falling back to local heuristics:`,e);let t=f(i);p(t.risk_score,t.status),t.reasons.length>0?s.textContent=`${t.reasons[0]} (Local Protection Active)`:s.textContent=`No threats found. Local Protection Active.`})});function p(e,t){a.textContent=e.toString();let n=251.2,r=n-n*e/100;i.style.strokeDashoffset=r.toString(),o.className=`status-badge`,t===`SAFE`?(i.style.stroke=`#10b981`,o.classList.add(`status-safe`),o.textContent=`Secured`):t===`SUSPICIOUS`?(i.style.stroke=`#f59e0b`,o.classList.add(`status-suspicious`),o.textContent=`Suspicious`):(i.style.stroke=`#ef4444`,o.classList.add(`status-dangerous`),o.textContent=`Dangerous`)}u.addEventListener(`click`,()=>{chrome.runtime.openOptionsPage()}),d.addEventListener(`click`,()=>{chrome.tabs.create({url:`http://localhost:5173/`})})});