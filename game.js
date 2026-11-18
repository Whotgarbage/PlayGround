(() => {
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = {
    score: $('score'), streak: $('streak'), best: $('bestStreak'), suspicion: $('suspicionFill'),
    suspicionText: $('suspicionText'), leadText: $('leadText'), clueCount: $('clueCount'),
    leadProgress: $('leadProgress'), leadStatus: $('leadStatus'), windowLabel: $('windowLabel'),
    nightLabel: $('nightLabel'), prompt: $('scenePrompt'), toast: $('toast'), crosshair: $('crosshair'),
    modal: $('modalBackdrop'), modalTitle: $('modalTitle'), modalKicker: $('modalKicker'), modalCopy: $('modalCopy'),
    modalTip: document.querySelector('.modal-tip'), start: $('startButton'), peek: $('peekButton'), sound: $('soundButton')
  };
  const windows = [145, 382, 618, 855];
  const clues = [
    { name: 'two teacups', short: 'TWO TEACUPS', icon: '☕', color: '#f2d89e' },
    { name: 'a lipstick kiss on the mirror', short: 'A LIPSTICK KISS', icon: '♥', color: '#f08c7a' },
    { name: 'a second dinner plate', short: 'TWO DINNER PLATES', icon: '✦', color: '#ead69d' },
    { name: 'a mystery scarf', short: 'A MYSTERY SCARF', icon: '〰', color: '#c4a4dc' },
    { name: 'a pair of muddy footprints', short: 'MUDDY FOOTPRINTS', icon: '●', color: '#d3a379' },
    { name: 'a hidden love note', short: 'A HIDDEN LOVE NOTE', icon: '♡', color: '#f2a0a4' }
  ];
  const rooms = [
    { wall: '#bc9870', inside: '#34445a', curtain: '#cb8063', person: '#364758' },
    { wall: '#8799a0', inside: '#39465b', curtain: '#a7b67f', person: '#433f54' },
    { wall: '#bb9578', inside: '#35455a', curtain: '#d18e73', person: '#3d4d61' },
    { wall: '#82939b', inside: '#3c465a', curtain: '#c9aa74', person: '#56424f' }
  ];
  let state = 'intro';
  let currentWindow = 0;
  let targetWindow = 0;
  let clueIndex = 0;
  let cluesFound = 0;
  let score = 0;
  let streak = 1;
  let bestStreak = 1;
  let suspicion = 8;
  let holding = false;
  let heldFor = 0;
  let clueEarned = false;
  let alertWindow = -1;
  let alertTimer = 0;
  let totalElapsed = 0;
  let lastFrame = 0;
  let toastTimer;
  let muted = false;
  let audio;
  const rand = (max) => Math.floor(Math.random() * max);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  function setTarget() {
    targetWindow = rand(windows.length);
    clueIndex = rand(clues.length);
    clueEarned = false;
    const clue = clues[clueIndex];
    ui.leadText.innerHTML = `The alibi is looking shaky. Find <b>${clue.name}</b>.`;
    ui.leadProgress.style.width = '0%';
    ui.leadStatus.textContent = 'OPEN';
    ui.leadStatus.style.color = '';
  }

  function updateUI() {
    ui.score.textContent = String(score).padStart(4, '0');
    ui.streak.textContent = `×${streak}`;
    ui.best.textContent = bestStreak;
    ui.clueCount.textContent = `${cluesFound} / 3`;
    ui.leadProgress.style.width = `${Math.min(cluesFound / 3 * 100, 100)}%`;
    ui.suspicion.style.width = `${suspicion}%`;
    ui.suspicion.classList.toggle('warm', suspicion >= 50 && suspicion < 78);
    ui.suspicion.classList.toggle('hot', suspicion >= 78);
    if (suspicion < 50) {
      ui.suspicionText.textContent = 'CALM'; ui.suspicionText.style.color = 'var(--mint)';
    } else if (suspicion < 78) {
      ui.suspicionText.textContent = 'SUSPICIOUS'; ui.suspicionText.style.color = '#f2b277';
    } else {
      ui.suspicionText.textContent = 'ALERT!'; ui.suspicionText.style.color = '#e87862';
    }
    ui.windowLabel.textContent = `WINDOW ${currentWindow + 1} / 4`;
    ui.nightLabel.textContent = `11:${String(42 + Math.floor(totalElapsed / 15)).padStart(2, '0')} PM`;
  }

  function toast(message, duration = 1400) {
    ui.toast.textContent = message;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), duration);
  }

  function beep(freq = 440, duration = .07, type = 'sine') {
    if (muted) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const osc = audio.createOscillator(); const gain = audio.createGain();
      osc.type = type; osc.frequency.value = freq; gain.gain.setValueAtTime(.035, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
      osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + duration);
    } catch (_) { /* sound is optional */ }
  }

  function move(amount) {
    if (state !== 'playing') return;
    currentWindow = (currentWindow + amount + windows.length) % windows.length;
    heldFor = 0; clueEarned = false; ui.leadProgress.style.width = '0%';
    updateUI(); beep(260 + currentWindow * 35, .045);
  }

  function beginPeek() {
    if (state !== 'playing' || holding) return;
    holding = true; heldFor = 0; clueEarned = false;
    ui.peek.classList.add('holding'); ui.crosshair.classList.add('active');
    ui.prompt.innerHTML = 'Hold steady… <span>●</span>';
  }
  function endPeek() {
    if (!holding) return;
    holding = false; ui.peek.classList.remove('holding'); ui.crosshair.classList.remove('active');
    if (state === 'playing') ui.prompt.innerHTML = 'Find the telltale clue <span>→</span>';
  }

  function startGame() {
    state = 'playing'; currentWindow = 0; cluesFound = 0; score = 0; streak = 1; bestStreak = 1;
    suspicion = 8; heldFor = 0; totalElapsed = 0; alertWindow = -1; alertTimer = 0;
    setTarget(); updateUI(); ui.modal.classList.add('hidden');
    toast('CASE FILE OPENED — FIND THE CLUE', 2200); beep(520, .12);
  }

  function finishGame(won) {
    state = won ? 'won' : 'lost'; endPeek();
    ui.modalTitle.innerHTML = won ? 'Case closed.<br><em>Nice work.</em>' : 'Uh-oh.<br><em>They saw you.</em>';
    ui.modalKicker.textContent = won ? 'THE ALLEY KNOWS' : 'TIME TO DISAPPEAR';
    ui.modalCopy.textContent = won
      ? `You found all three clues and kept the mystery alive. Your final case score was ${String(score).padStart(4, '0')} points.`
      : `The neighbors got wise before you could close the case. You made it to ${cluesFound} of 3 clues with ${String(score).padStart(4, '0')} points.`;
    ui.modalTip.innerHTML = `<span>BEST STREAK</span><b>×${bestStreak} · ${won ? 'A tidy bit of detective work.' : 'Try shorter peeks between clues.'}</b>`;
    ui.start.innerHTML = 'PLAY AGAIN <span>→</span>';
    ui.modal.classList.remove('hidden');
    beep(won ? 660 : 190, .25, won ? 'sine' : 'triangle');
  }

  function drawBackground(w, h, t) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#17283b'); sky.addColorStop(.55, '#26384a'); sky.addColorStop(1, '#827a6d');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    // Moon and quiet stars
    ctx.fillStyle = '#e9dcb5'; ctx.beginPath(); ctx.arc(w * .77, h * .12, Math.min(w, h) * .045, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#17283b'; ctx.beginPath(); ctx.arc(w * .79, h * .105, Math.min(w, h) * .04, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 38; i++) {
      const x = ((i * 197 + 61) % 997) / 1000 * w, y = ((i * 79 + 22) % 240) / 700 * h;
      ctx.globalAlpha = .25 + .35 * Math.sin(t * .7 + i);
      ctx.fillStyle = '#e8e4d4'; ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
    // distant rooftops
    ctx.fillStyle = '#1a2934';
    const roofs = [[0,.38,.16,.17],[.13,.3,.2,.24],[.31,.36,.15,.19],[.48,.29,.19,.26],[.71,.35,.17,.2],[.86,.27,.2,.28]];
    roofs.forEach(([x,y,rw,rh],i) => {
      ctx.fillRect(x*w, y*h, rw*w, rh*h);
      ctx.beginPath(); ctx.moveTo(x*w-8,y*h); ctx.lineTo((x+rw/2)*w,(y-.09)*h); ctx.lineTo((x+rw)*w+8,y*h); ctx.fill();
      for(let j=0;j<3;j++){ctx.fillStyle=i%2?'#e4b974':'#8fa6a0';ctx.globalAlpha=.35;ctx.fillRect((x+.05+j*.052)*w,(y+.045)*h,5,7);ctx.globalAlpha=1;ctx.fillStyle='#1a2934';}
    });
    // starside haze
    const haze=ctx.createLinearGradient(0,h*.45,0,h*.9);haze.addColorStop(0,'#e1ba7d00');haze.addColorStop(1,'#e1ba7d30');ctx.fillStyle=haze;ctx.fillRect(0,h*.4,w,h*.5);
  }

  function drawApartment(x, index, h, t) {
    const unitW = 218, top = h * .285, bottom = h * .865;
    const room = rooms[index];
    // facade + roof cap
    ctx.fillStyle = ['#594f51','#46565a','#69544c','#4d5960'][index];
    ctx.fillRect(x-unitW/2, top, unitW, bottom-top);
    ctx.fillStyle = ['#887668','#71807b','#8b7668','#71807b'][index];
    ctx.fillRect(x-unitW/2-5, top-7, unitW+10, 10);
    // brick texture
    ctx.globalAlpha=.14;ctx.strokeStyle='#e2d2b3';ctx.lineWidth=1;
    for(let r=0;r<7;r++){const yy=top+20+r*36;ctx.beginPath();ctx.moveTo(x-unitW/2+5,yy);ctx.lineTo(x+unitW/2-5,yy);ctx.stroke();
      for(let c=0;c<3;c++){const bx=x-unitW/2+42+c*68+(r%2?34:0);ctx.beginPath();ctx.moveTo(bx,yy-18);ctx.lineTo(bx,yy);ctx.stroke();}}
    ctx.globalAlpha=1;
    // side window, details
    ctx.fillStyle='#36434b';ctx.fillRect(x-93, top+53, 34, 55);ctx.fillStyle='#e3b879';ctx.globalAlpha=.45;ctx.fillRect(x-89,top+57,26,47);ctx.globalAlpha=1;
    // main warmly lit room, some have curtains partly drawn
    const wx=x-53, wy=top+73, ww=106, wh=148;
    const glow=ctx.createRadialGradient(x,wy+45,10,x,wy+55,135);glow.addColorStop(0,'#ffdb9d40');glow.addColorStop(1,'#ffc47100');ctx.fillStyle=glow;ctx.fillRect(x-135,wy-70,270,240);
    ctx.fillStyle='#2e3948';ctx.fillRect(wx-5,wy-5,ww+10,wh+10);
    ctx.fillStyle=room.inside;ctx.fillRect(wx,wy,ww,wh);
    // room wallpaper stripes
    ctx.globalAlpha=.15;ctx.fillStyle='#e8ca9a';for(let j=0;j<6;j++)ctx.fillRect(wx+j*20,wy,2,wh);ctx.globalAlpha=1;
    // floor and furniture
    ctx.fillStyle='#8b6a58';ctx.fillRect(wx,wy+wh-26,ww,26);
    ctx.fillStyle='#c39870';ctx.fillRect(wx+9,wy+95,38,27);ctx.fillStyle='#765a57';ctx.fillRect(wx+9,wy+114,38,8);
    ctx.fillStyle='#52616a';ctx.fillRect(wx+67,wy+102,28,21);ctx.fillStyle='#d5ad76';ctx.fillRect(wx+72,wy+97,18,8);
    // table and clue prop
    ctx.fillStyle='#89664f';ctx.fillRect(x-24,wy+102,48,5);ctx.fillRect(x-20,wy+107,4,19);ctx.fillRect(x+16,wy+107,4,19);
    // harmless cartoon houseplants
    ctx.fillStyle='#586f5c';ctx.beginPath();ctx.ellipse(x-39,wy+127,8,12,0,0,Math.PI*2);ctx.fill();ctx.fillRect(x-43,wy+127,8,15);
    // silhouettes: two characters in the affair apartment, otherwise one
    drawPerson(x-12,wy+96,'#3b3e50',.73);
    if(index===targetWindow || index===1) drawPerson(x+20,wy+94,'#575064',.64);
    // current clue displayed in the target room
    if(index===targetWindow) drawClue(x,wy,t);
    // curtains, softly swaying
    const sway=Math.sin(t*1.3+index)*2;
    ctx.fillStyle=room.curtain;ctx.beginPath();ctx.moveTo(wx,wy);ctx.lineTo(wx+19+sway,wy);ctx.lineTo(wx+14,wy+wh-5);ctx.lineTo(wx,wy+wh-8);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(wx+ww,wy);ctx.lineTo(wx+ww-19-sway,wy);ctx.lineTo(wx+ww-14,wy+wh-5);ctx.lineTo(wx+ww,wy+wh-8);ctx.closePath();ctx.fill();
    // window frame
    ctx.strokeStyle='#d1b894';ctx.lineWidth=5;ctx.strokeRect(wx,wy,ww,wh);ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(x,wy);ctx.lineTo(x,wy+wh);ctx.moveTo(wx,wy+wh*.57);ctx.lineTo(wx+ww,wy+wh*.57);ctx.stroke();
    // little flower boxes
    ctx.fillStyle='#4b4c42';ctx.fillRect(wx-4,wy+wh+2,ww+8,10);
    for(let f=0;f<7;f++){ctx.fillStyle=['#e39e86','#d4b674','#a7bb91'][f%3];ctx.beginPath();ctx.arc(wx+8+f*15,wy+wh+1,4,0,Math.PI*2);ctx.fill();}
    // apartment number
    ctx.fillStyle='#d4c3a3';ctx.font='9px monospace';ctx.textAlign='center';ctx.fillText(String(index+1)+'B',x,top+38);
  }

  function drawPerson(x, base, color, scale) {
    ctx.save();ctx.translate(x,base);ctx.scale(scale,scale);
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,-29,9,0,Math.PI*2);ctx.fill();
    ctx.fillRect(-10,-21,20,27);ctx.fillRect(-9,5,7,17);ctx.fillRect(3,5,7,17);
    ctx.beginPath();ctx.moveTo(-9,-17);ctx.lineTo(-20,-1);ctx.lineTo(-15,2);ctx.lineTo(-4,-9);ctx.fill();
    ctx.beginPath();ctx.moveTo(9,-17);ctx.lineTo(18,-3);ctx.lineTo(14,0);ctx.lineTo(5,-9);ctx.fill();ctx.restore();
  }

  function drawClue(x, wy, t) {
    const clue=clues[clueIndex];ctx.save();ctx.translate(x,wy+101);
    ctx.shadowColor=clue.color;ctx.shadowBlur=10+Math.sin(t*5)*3;ctx.fillStyle=clue.color;
    if(clueIndex===0){
      // two unmistakable teacups
      for(const dx of [-10,10]){ctx.beginPath();ctx.ellipse(dx,0,7,5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff0c9';ctx.beginPath();ctx.ellipse(dx,0,4,2.5,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle=clue.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(dx+7,0,3,-Math.PI/2,Math.PI/2);ctx.stroke();ctx.fillStyle=clue.color;}
    }else if(clueIndex===1||clueIndex===5){ctx.font='bold 23px serif';ctx.textAlign='center';ctx.fillText(clue.icon,0,7);}
    else if(clueIndex===2){ctx.beginPath();ctx.ellipse(-10,0,8,5,0,0,Math.PI*2);ctx.ellipse(10,0,8,5,0,0,Math.PI*2);ctx.fill();}
    else if(clueIndex===3){ctx.strokeStyle=clue.color;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-17,-2);ctx.quadraticCurveTo(-3,-14,5,0);ctx.quadraticCurveTo(13,12,18,-2);ctx.stroke();}
    else {ctx.font='bold 18px serif';ctx.textAlign='center';ctx.fillText('● ●',0,5);}
    ctx.restore();
  }

  function drawStreet(w,h,t) {
    // pavement
    ctx.fillStyle='#4c4a48';ctx.fillRect(0,h*.865,w,h*.135);
    ctx.fillStyle='#766e60';ctx.fillRect(0,h*.86,w,h*.018);
    ctx.globalAlpha=.23;ctx.strokeStyle='#d8cbb1';ctx.lineWidth=1;
    for(let i=0;i<18;i++){const x=i*w/17;ctx.beginPath();ctx.moveTo(x,h*.89);ctx.lineTo(x-15,h);ctx.stroke();}
    ctx.globalAlpha=1;
    // pavement dashes and streetlamp
    ctx.fillStyle='#d8c898';ctx.globalAlpha=.4;ctx.fillRect(w*.08,h*.93,45,3);ctx.fillRect(w*.73,h*.96,70,3);ctx.globalAlpha=1;
    ctx.fillStyle='#27313a';ctx.fillRect(w*.93,h*.35,5,h*.51);ctx.fillRect(w*.905,h*.34,55,5);
    ctx.fillStyle='#e6c888';ctx.beginPath();ctx.arc(w*.914,h*.35,8,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#e6c88822';ctx.beginPath();ctx.moveTo(w*.914,h*.36);ctx.lineTo(w*.78,h*.87);ctx.lineTo(w,h*.87);ctx.closePath();ctx.fill();
    // potted shrubs
    [0.035,.25,.5,.75,.98].forEach((p,i)=>{const xx=w*p;ctx.fillStyle='#3d3d37';ctx.fillRect(xx-15,h*.82,30,24);ctx.fillStyle=['#526854','#596b56','#4a6251'][i%3];ctx.beginPath();ctx.arc(xx,h*.81,18,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(xx-10,h*.83,12,0,Math.PI*2);ctx.fill();});
    // the detective's tiny shadow, in the safe dark edge
    const px=windows[currentWindow]/1000*w;ctx.globalAlpha=.5;ctx.fillStyle='#101820';ctx.beginPath();ctx.ellipse(px,h*.955,28,6,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    drawPerson(px,h*.95,'#202a34',.55);
    // alert face appears briefly in a neighbor's upstairs window
    if(alertTimer>0){const ax=windows[alertWindow]/1000*w;ctx.fillStyle='#e7d4b2';ctx.beginPath();ctx.arc(ax,h*.38,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#2b2d36';ctx.fillRect(ax-9,h*.38,18,11);ctx.fillStyle='#212530';ctx.fillRect(ax-11,h*.39,6,3);ctx.fillRect(ax+5,h*.39,6,3);}
  }

  function draw(time) {
    const w=canvas.width, h=canvas.height;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);
    ctx.scale(w/1000,h/700);drawBackground(1000,700,time);
    windows.forEach((x,i)=>drawApartment(x,i,700,time));
    drawStreet(1000,700,time);
    // selected window outline subtly responds to focus
    const x=windows[currentWindow];ctx.strokeStyle=holding?'#c5efd1':'#eed6a177';ctx.lineWidth=holding?2:1;ctx.setLineDash(holding?[5,5]:[]);ctx.strokeRect(x-56,700*.285+67,112,158);ctx.setLineDash([]);
    if(holding){ctx.globalAlpha=.11+Math.sin(time*8)*.025;ctx.fillStyle='#b9e8ca';ctx.beginPath();ctx.arc(500,350,145,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
  }

  function frame(now) {
    const dt=Math.min((now-lastFrame)/1000||0, .05);lastFrame=now;
    if(state==='playing'){
      totalElapsed+=dt;
      if(alertTimer>0)alertTimer-=dt;
      // The neighbor checks in now and then; the suspicious glances make a long peek risky.
      if(totalElapsed>5 && Math.floor(totalElapsed/8)!==Math.floor((totalElapsed-dt)/8)){
        alertWindow=(currentWindow+1+rand(3))%4;alertTimer=2.1;
        if(holding)suspicion+=10;
        toast('A NEIGHBOR IS MAKING THE ROUNDS',1200);beep(170,.12,'triangle');
      }
      if(holding){
        heldFor+=dt;
        const risk = currentWindow===targetWindow ? 5.3 : 8.5;
        suspicion += risk*dt;
        ui.leadProgress.style.width=`${Math.min(heldFor/1.35*100,100)}%`;
        if(!clueEarned && currentWindow===targetWindow && heldFor>=1.35){
          clueEarned=true;cluesFound++;const bonus=Math.round(115+heldFor*24+Math.max(0,75-suspicion));
          score+=bonus*streak;bestStreak=Math.max(bestStreak,streak);streak++;
          ui.leadStatus.textContent='FOUND';ui.leadStatus.style.color='#b6e4c9';
          ui.leadText.innerHTML=`<b>${clues[clueIndex].short}</b> — that's one part of the story that doesn't add up.`;
          updateUI();toast(`CLUE FOUND  +${bonus*(streak-1)} POINTS`,1600);beep(720,.09);setTimeout(()=>beep(920,.12),90);
          if(cluesFound>=3){setTimeout(()=>finishGame(true),850);}else setTimeout(setTarget,1250);
        }
      } else {
        suspicion=Math.max(8,suspicion-10*dt);
        ui.leadProgress.style.width='0%';
      }
      if(suspicion>=100)finishGame(false);
      updateUI();
    }
    draw(now/1000);requestAnimationFrame(frame);
  }

  document.addEventListener('keydown',(e)=>{
    if(e.code==='ArrowLeft'||e.code==='KeyA'){e.preventDefault();move(-1);}
    if(e.code==='ArrowRight'||e.code==='KeyD'){e.preventDefault();move(1);}
    if(e.code==='Space'){e.preventDefault();beginPeek();}
    if(e.code==='Escape')endPeek();
  });
  document.addEventListener('keyup',(e)=>{if(e.code==='Space')endPeek();});
  window.addEventListener('blur',endPeek);
  $('leftButton').addEventListener('click',()=>move(-1));$('rightButton').addEventListener('click',()=>move(1));
  ui.peek.addEventListener('pointerdown',(e)=>{e.preventDefault();ui.peek.setPointerCapture?.(e.pointerId);beginPeek();});
  ui.peek.addEventListener('pointerup',(e)=>{e.preventDefault();endPeek();});
  ui.peek.addEventListener('pointercancel',endPeek);ui.peek.addEventListener('lostpointercapture',endPeek);
  ui.start.addEventListener('click',startGame);
  ui.sound.addEventListener('click',()=>{muted=!muted;ui.sound.innerHTML=muted?'♫ <span>OFF</span>':'♫ <span>ON</span>';if(!muted)beep(520,.08);});
  updateUI();requestAnimationFrame(frame);
})();
