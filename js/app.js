/* Lógica de la página DJ Music Perú */
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { plan: 'exclusivo', role: 0, cat: 0, billing: 'mensual', t: 0, faq: 0, disk: '1tb', menuOpen: false, ckBanner: false, ckCfg: false, ckPolicy: false, ckAna: false, ckAds: false, name: '', cur: 0, playing: false, loading: false, promoIn: false, time: 0, dur: 0, vol: 0.8, muted: false, shuffle: false, repeat: false, notice: '' };
  }
  goT(i, dir) {
    this.setState({ t: i, tDir: dir });
    this.tStart = Date.now();
  }
  ckLoad() {
    try { var v = window.localStorage.getItem('djmp_cookies_v1'); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  ckStore(ana, ads) {
    var rec = { necesarias: true, analitica: !!ana, publicidad: !!ads, fecha: new Date().toISOString() };
    try { window.localStorage.setItem('djmp_cookies_v1', JSON.stringify(rec)); } catch (e) {}
    // Al publicar en Vercel: aquí se activan Meta Pixel y TikTok Pixel solo si rec.publicidad es true, y la analítica si rec.analitica es true.
    try { window.dispatchEvent(new CustomEvent('djmp-consent', { detail: rec })); } catch (e) {}
    this.setState({ ckAna: !!ana, ckAds: !!ads, ckBanner: false, ckCfg: false, ckPolicy: false });
  }
  componentDidMount() {
    var ckPrev = this.ckLoad();
    if (ckPrev) this.setState({ ckAna: !!ckPrev.analitica, ckAds: !!ckPrev.publicidad });
    else this.setState({ ckBanner: true });
    var selfT = this;
    this.tStart = Date.now();
    this.tTimer = setInterval(function () {
      if (selfT.reduced || selfT.state.tPaused) { selfT.tStart = Date.now(); return; }
      if (Date.now() - selfT.tStart >= 7000) selfT.goT((selfT.state.t + 1) % (selfT.tCount || 3), 'next');
    }, 250);
    var self = this;
    this.cache = {}; this.loadedIdx = -1;
    this.reduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.promoEl && typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          self.setState({ promoIn: true });
          self.decrypt(self.state.cur).catch(function () {});
          self.io.disconnect();
        }
      }, { threshold: 0.25 });
      this.io.observe(this.promoEl);
    } else { this.setState({ promoIn: true }); }
  }
  componentWillUnmount() {
    if (this.tTimer) clearInterval(this.tTimer);
    if (this.io) this.io.disconnect();
    var c = this.cache || {};
    Object.keys(c).forEach(function (k) { if (typeof c[k] === 'string') URL.revokeObjectURL(c[k]); });
  }
  keyBytes() {
    var a = [66, 165, 40, 140, 36, 20, 67, 165, 197, 94, 0, 248, 160, 91, 117, 59, 150, 166, 52, 168, 87, 74, 95, 99, 223, 23, 26, 55, 231, 55, 105, 44], b = [144, 174, 81, 220, 115, 178, 235, 44, 145, 153, 181, 104, 108, 222, 170, 107, 176, 66, 236, 71, 44, 41, 24, 216, 215, 8, 141, 197, 159, 28, 105, 74], k = new Uint8Array(32);
    for (var i = 0; i < 32; i++) k[i] = a[i] ^ b[i];
    return k;
  }
  getKey() {
    if (!this.keyP) this.keyP = crypto.subtle.importKey('raw', this.keyBytes(), 'AES-GCM', false, ['decrypt']);
    return this.keyP;
  }
  decrypt(i) {
    var self = this, t = this.trackData()[i];
    if (!t || !t.enc) return Promise.reject(new Error('sin audio'));
    this.cache = this.cache || {};
    if (typeof this.cache[i] === 'string') return Promise.resolve(this.cache[i]);
    if (this.cache[i]) return this.cache[i];
    var pr = fetch(t.enc).then(function (r) { if (!r.ok) throw new Error('red'); return r.text(); }).then(function (b64) {
      var bin = atob(b64.trim()), n = bin.length, u = new Uint8Array(n);
      for (var j = 0; j < n; j++) u[j] = bin.charCodeAt(j);
      return self.getKey().then(function (key) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, key, u.slice(12));
      });
    }).then(function (buf) {
      var url = URL.createObjectURL(new Blob([buf], { type: 'audio/mp4' }));
      self.cache[i] = url;
      return url;
    });
    this.cache[i] = pr;
    pr.catch(function () { delete self.cache[i]; });
    return pr;
  }
  unlock() {
    if (this.unlocked || !this.audio) return;
    this.unlocked = true;
    var sr = 8000, n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    var w = function (o, str) { for (var k = 0; k < str.length; k++) v.setUint8(o + k, str.charCodeAt(k)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
    for (var k = 0; k < n; k++) v.setUint8(44 + k, 128);
    this.silent = true;
    this.audio.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    var p = this.audio.play(); if (p && p.catch) p.catch(function () {});
  }
  startAudio(i, url) {
    if (this.state.cur !== i || !this.audio) return;
    if (this.loadedIdx !== i) { this.silent = false; this.audio.src = url; this.loadedIdx = i; }
    this.silent = false;
    var p = this.audio.play(); if (p && p.catch) p.catch(function () {});
    this.prefetchNext(i);
  }
  prefetchNext(i) {
    var list = this.trackData();
    for (var k = 1; k < list.length; k++) { var j = (i + k) % list.length; if (list[j].enc) { this.decrypt(j).catch(function () {}); return; } }
  }
  playNow(idx) {
    var self = this, i = typeof idx === 'number' ? idx : this.state.cur;
    var t = this.trackData()[i];
    if (!t.enc) { this.setState({ notice: 'La vista previa de este tema estará disponible pronto.', playing: false }); return; }
    this.cache = this.cache || {};
    if (typeof this.cache[i] === 'string') { this.setState({ notice: '' }); this.startAudio(i, this.cache[i]); return; }
    this.unlock();
    this.setState({ loading: true, notice: '' });
    this.decrypt(i).then(function (url) {
      self.setState({ loading: false });
      self.startAudio(i, url);
    }).catch(function () {
      self.setState({ loading: false, playing: false, notice: 'No se pudo cargar la vista previa. Revisa tu conexión e inténtalo de nuevo.' });
    });
  }
  goTo(i, play) {
    if (this.audio && !this.audio.paused) this.audio.pause();
    if (i !== this.state.cur) this.setState({ cur: i, time: 0, dur: 0, notice: '' });
    if (play) this.playNow(i);
  }
  trackData() {
    // Top 10: la lista se lee de tracks.json (ver COMO-ACTUALIZAR.md).
    var list = (window.__TRACKS && window.__TRACKS.length) ? window.__TRACKS.slice(0, 10).map(function (t) { return Object.assign({}, t); }) : [];
    while (list.length < 10) {
      list.push({ title: '[Próximo tema ' + (list.length + 1) + ']', artist: '', type: 'Pronto', bpm: '', len: '—', enc: '' });
    }
    return list.map(function (t) {
      t.full = t.artist ? t.title + ' (' + t.artist + ')' : t.title;
      t.meta = t.bpm ? t.bpm + ' BPM' : 'Vista previa disponible pronto';
      return t;
    });
  }
  fmt(x) {
    x = Math.max(0, Math.floor(x || 0));
    var m = Math.floor(x / 60), sec = x % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }
  wa(msg) {
    return 'https://wa.me/51946393104?text=' + encodeURIComponent(msg);
  }
  pill(active, dark) {
    var base = 'border: 0; cursor: pointer; font: inherit; font-size: 14px; font-weight: 600; padding: 10px 18px; border-radius: 999px; min-height: 44px; ';
    return active ? base + 'background: #191b30; color: #ffffff;' : base + 'background: transparent; color: #191b30;';
  }
  renderVals() {
    var s = this.state;
    var self = this;
    var who = s.name && s.name.trim() ? ' Soy ' + s.name.trim() + '.' : '';
    var planName = s.plan === 'premium' ? 'Premium' : 'Exclusiva';
    var waLink = this.wa('Hola DJ Music Perú, quiero la Membresía ' + planName + '.' + who);

    var heroPlans = [
      { id: 'premium', label: 'Premium' },
      { id: 'exclusivo', label: 'Exclusivo' }
    ].map(function (p) {
      var a = s.plan === p.id;
      return { label: p.label, active: a ? 'true' : 'false', style: self.pill(a), pick: function () { self.setState({ plan: p.id }); } };
    });
    var incl = function (arr) {
      return arr.map(function (t, i) {
        return { t: t, style: 'display: flex; gap: 10px; align-items: flex-start; animation-delay: ' + (380 + i * 90) + 'ms' };
      });
    };
    var premiumIncl = incl(['Ediciones Premium + Bonus VIP', 'Actualización martes y viernes', 'Carpetas de todos los géneros']);
    var exclusiveIncl = incl(['Ediciones exclusivas y privadas', 'Editores TOP del Perú', 'Incluye todo el plan Premium', 'Actualización martes, viernes y sábado', 'Versiones exclusivas']);
    var heroSummary = s.plan === 'premium'
      ? 'Premium: 80 packs nuevos por semana, martes y viernes. Desde S/15 al mes.'
      : 'Exclusivo: 90 packs nuevos por semana más ediciones privadas, martes, viernes y sábado. Desde S/20 al mes.';

    var IMG_PLANES = 'assets/img/planes.jpg';
    var IMG_EXCL = 'assets/img/exclusiva.jpg';
    var IMG_PROMO = 'assets/img/promo.jpg';
    var rolesData = [
      { label: 'DJs de discoteca', title: 'Llega al fin de semana con lo que nadie más está tocando', desc: 'Las ediciones privadas salen el sábado en Exclusivo, justo antes de tus fechas fuertes.', bullets: ['Versiones que solo existen dentro de la membresía', 'Intros y mashups para abrir y subir la pista', 'Virales listos apenas pegan en redes', 'Actualización martes, viernes y sábado'], cta: 'Quiero el plan Exclusivo', img: IMG_EXCL, alt: 'Flyer de la Membresía Exclusiva' },
      { label: 'DJs de eventos', title: 'Matrimonios, quinceañeros y fiestas con música para todas las edades', desc: 'Actuales, retro y virales en un solo lugar, con puentes para pasar de género sin cortar el ambiente.', bullets: ['Todos los géneros: actuales, retro y virales', 'Puentes y transiciones entre géneros', 'Open show para la entrada de los novios o la quinceañera', 'Link permanente para descargar cuando lo necesites'], cta: 'Ver qué plan me conviene', img: IMG_PLANES, alt: 'Comparativa de planes Premium y Exclusivo' },
      { label: 'Backup + Disco duro', title: 'Backup Premium en disco duro, listo para conectar', desc: '900 GB de música premium actualizada hasta octubre 2026 en un disco duro Toshiba. Ideal para productoras, discotecas y DJs que tocan sin internet.', disk: true, bullets: [], cta: '', img: '', alt: '' },
      { label: 'DJs que empiezan', title: 'Arma tu biblioteca desde el primer mes', desc: 'Con Premium tienes todos los géneros y 80 packs semanales desde S/15, sin pagar tema por tema.', bullets: ['Biblioteca completa por género', 'Ediciones premium listas para mezclar', 'Precio accesible, mensual o anual', 'Te ayudamos a elegir por WhatsApp'], cta: 'Empezar con Premium', img: IMG_PLANES, alt: 'Planes de membresía de octubre' }
    ];
    var diskData = {
      '1tb': { label: '1 TB', price: 'S/480.00', img: 'assets/img/disco1tb.jpg', alt: 'Backup Premium más disco duro de 1 TB por S/480', bullets: ['900 GB de música premium actualizada', 'Backup actualizado hasta octubre 2026', 'Disco duro Toshiba de 1 TB', 'Envío gratis a todo el Perú'], cta: 'Pedir disco de 1 TB' },
      '2tb': { label: '2 TB', price: 'S/560.00', img: 'assets/img/disco2tb.jpg', alt: 'Backup Premium más disco duro de 2 TB por S/560, con funda gratis', bullets: ['900 GB de música premium actualizada', 'Backup actualizado hasta octubre 2026', 'Disco duro Toshiba de 2 TB, con espacio libre para tu música', 'Funda para disco duro gratis', 'Envío gratis a todo el Perú'], cta: 'Pedir disco de 2 TB' }
    };
    var dk = diskData[s.disk || '1tb'];
    var diskSizes = ['1tb', '2tb'].map(function (k) {
      var a = (s.disk || '1tb') === k;
      return { label: diskData[k].label + ' · ' + diskData[k].price, active: a ? 'true' : 'false', style: self.pill(a), pick: function () { self.setState({ disk: k }); } };
    });
    var roleSel = rolesData[s.role];
    var roleOut = roleSel.disk
      ? { title: roleSel.title, desc: roleSel.desc, bullets: dk.bullets, cta: dk.cta, img: dk.img, alt: dk.alt, disk: true, notDisk: false, d1: (s.disk || '1tb') === '1tb', d2: s.disk === '2tb', price: dk.price, href: self.wa('Hola, quiero el Backup Premium + disco duro de ' + dk.label + ' (' + dk.price + ').') }
      : { title: roleSel.title, desc: roleSel.desc, bullets: roleSel.bullets, cta: roleSel.cta, img: roleSel.img, alt: roleSel.alt, disk: false, notDisk: true, d1: false, d2: false, price: '', href: waLink };
    var roles = rolesData.map(function (r, i) {
      var a = s.role === i;
      var st = 'cursor: pointer; font: inherit; font-size: 14px; font-weight: 600; padding: 11px 18px; border-radius: 999px; min-height: 44px; border: 1px solid ' + (a ? '#191b30' : '#dfe2e8') + '; background: ' + (a ? '#191b30' : '#ffffff') + '; color: ' + (a ? '#ffffff' : '#191b30') + ';';
      return { label: r.label, active: a ? 'true' : 'false', style: st, pick: function () { self.setState({ role: i }); } };
    });

    var catsData = [
      { label: 'Ediciones exclusivas', plan: 'Exclusivo', status: 'Solo en Exclusivo', desc: 'Versiones privadas hechas por los editores top del Perú que no encontrarás fuera de la membresía. Audio de alta fidelidad.', bullets: ['Se publican cada sábado', 'Solo para miembros Exclusivo', 'Incluye bonus VIP'] },
      { label: 'Intros', plan: 'Ambos planes', status: 'Premium y Exclusivo', desc: 'Entradas editadas para arrancar tu set con fuerza o presentar a un artista.', bullets: ['Listas para mezclar', 'De todos los géneros', 'Nuevas cada semana'] },
      { label: 'Mashups', plan: 'Ambos planes', status: 'Premium y Exclusivo', desc: 'Combinaciones de temas para mantener la pista arriba sin repetir lo que todos tocan.', bullets: ['Actuales con retro', 'Virales mezclados con clásicos', 'Tonalidad trabajada por el editor'] },
      { label: 'Puentes', plan: 'Ambos planes', status: 'Premium y Exclusivo', desc: 'Transiciones para pasar de un género a otro sin cortar el ambiente.', bullets: ['Entre géneros y velocidades', 'Ideales para eventos sociales', 'Fáciles de mezclar'] },
      { label: 'Open show', plan: 'Ambos planes', status: 'Premium y Exclusivo', desc: 'Aperturas temáticas para empezar fuerte, como el Open Exclusivo de Halloween 2026.', bullets: ['Temáticos por temporada', 'Para entradas y momentos especiales', 'Halloween 2026 ya disponible'] },
      { label: 'Acapellas Splice', plan: 'Exclusivo', status: 'Solo en Exclusivo', desc: 'Acapellas para que armes tus propias versiones y edits en vivo.', bullets: ['Voces limpias', 'Para crear tus propios edits', 'Incluidas en Exclusivo'] },
      { label: 'Virales y FX', plan: 'Ambos planes', status: 'Premium y Exclusivo', desc: 'Lo que está sonando en redes y efectos para darle vida a tus mezclas.', bullets: ['Virales apenas aparecen', 'Efectos de sonido para shows', 'Actualizados cada semana'] }
    ];
    var cats = catsData.map(function (c, i) {
      var a = s.cat === i;
      var st = 'width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; cursor: pointer; font: inherit; font-size: 15px; font-weight: 600; padding: 12px 16px; border-radius: 14px; min-height: 44px; color: #191b30; border: 1px solid ' + (a ? '#e3e6eb' : 'transparent') + '; background: ' + (a ? '#ffffff' : 'transparent') + '; box-shadow: ' + (a ? 'inset 3px 0 0 #ff1f1f, 0 4px 14px rgba(25,27,48,.06)' : 'none') + ';';
      return { label: c.label, plan: c.plan, active: a ? 'true' : 'false', style: st, pick: function () { self.setState({ cat: i }); } };
    });
    var c = catsData[s.cat];
    var onlyEx = c.plan === 'Exclusivo';
    var tagOn = 'font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; background: #ffe8e9; color: #a10a10;';
    var tagNav = 'font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; background: #191b30; color: #ffffff;';
    var week = onlyEx
      ? [ { day: 'Martes', tag: 'Plan base', tagStyle: tagNav, items: ['Packs por género', 'Virales de la semana'] },
          { day: 'Viernes', tag: 'Plan base', tagStyle: tagNav, items: ['Packs por género', 'Retro y clásicos'] },
          { day: 'Sábado', tag: c.label, tagStyle: tagOn, items: [c.label + ': lote nuevo', 'Bonus VIP', 'Solo miembros Exclusivo'] } ]
      : [ { day: 'Martes', tag: c.label, tagStyle: tagOn, items: [c.label + ': actuales', c.label + ': virales'] },
          { day: 'Viernes', tag: c.label, tagStyle: tagOn, items: [c.label + ': retro', c.label + ': fin de semana'] },
          { day: 'Sábado', tag: 'Exclusivo', tagStyle: tagNav, items: ['Ediciones privadas', 'Bonus VIP'] } ];
    var cat = { label: c.label, status: c.status, desc: c.desc, bullets: c.bullets, week: week };

    var weekBars = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(function (d) {
      var pr = (d === 'Mar' || d === 'Vie') ? 70 : 0;
      var ex = (d === 'Mar' || d === 'Vie') ? 24 : (d === 'Sáb' ? 80 : 0);
      var b = 'display: block; border-radius: 8px; width: 100%; ';
      return { d: d, pr: b + 'background: #191b30; height: ' + pr + '%;', ex: b + 'background: #ff1f1f; height: ' + ex + '%;' };
    });

    var tData = [
      { photo: 'assets/img/testi1.jpg', name: 'DJ Miguel Saravia', role: 'Lima', plan: 'Plan Exclusivo', quote: 'Antes pagaba una membresía que repetía los mismos temas tres meses seguidos. Aquí sé que el martes y el viernes hay material nuevo, y el sábado llegan las privadas para mis fechas.' },
      { photo: 'assets/img/testi4.jpg', name: 'DJ Ingrid Perú', role: 'Arequipa', plan: 'Plan Exclusivo', quote: 'Los recomiendo. Cuando estoy en un evento y necesito un tema, me lo brindan rápido, y puedo solicitar varios edits: es uno de los beneficios de mi plan Exclusivo.' },
      { photo: 'assets/img/testi6.jpg', name: 'DJ Adriana Pinedo', role: 'Piura', plan: 'Plan Exclusivo', quote: 'Llegué por recomendación y cumplieron mis expectativas. Soy clienta desde hace más de 2 años: brindan buen contenido y ediciones de calidad, siempre actualizadas para mis eventos.' },
      { photo: 'assets/img/testi2.jpg', name: 'DJ Diego Chong', role: 'Trujillo', plan: 'Plan Exclusivo', quote: 'Los puentes y mashups me ahorran horas de edición. Pago una vez al mes y tengo actuales, retro y virales ordenados por género.' },
      { photo: 'assets/img/testi3.jpg', name: 'InkaBar Producciones', role: 'Productora de eventos, Lima', plan: 'Cliente corporativo', quote: 'Compramos un disco duro de 2 TB para el equipo y luego la membresía para mantenerlo al día. La atención por WhatsApp fue rápida en todo momento.' },
      { photo: 'assets/img/testi5.jpg', name: 'DJ Ricardo Six', role: 'Ica', plan: 'Plan Premium', quote: 'Los recomiendo. Encuentro música variada y ordenada por géneros, y la membresía tiene muy buenos editores.' }
    ];
    var t = tData[s.t];
    this.tCount = tData.length;

    var billings = [{ id: 'mensual', label: 'Mensual' }, { id: 'anual', label: 'Anual' }].map(function (b) {
      var a = s.billing === b.id;
      return { label: b.label, active: a ? 'true' : 'false', style: self.pill(a), pick: function () { self.setState({ billing: b.id }); } };
    });
    var annual = s.billing === 'anual';

    var faqData = [
      { q: '¿Cómo recibo la música después de pagar?', a: 'Envías tu comprobante por WhatsApp al 946 393 104 y recibes acceso inmediato con un link permanente para descargar durante tu membresía.' },
      { q: '¿Qué diferencia hay entre Premium y Exclusivo?', a: 'Premium incluye todos los géneros, ediciones premium, intros, mashups, puentes y open show, con 80 packs nuevos por semana los martes y viernes. Exclusivo suma ediciones privadas de editores top, acapellas Splice, actualización también los sábados y 90 packs por semana con bonus VIP.' },
      { q: '¿Qué días se actualiza la membresía?', a: 'Premium se actualiza martes y viernes. Exclusivo se actualiza martes, viernes y sábado.' },
      { q: '¿Qué medios de pago aceptan?', a: 'Yape, Plin, transferencia bancaria, PayPal, Takenos y Western Union.' },
      { q: '¿Puedo pagar desde fuera del Perú?', a: 'Sí. Puedes pagar con PayPal, Takenos o Western Union. Escríbenos y te enviamos los datos.' },
      { q: '¿Trabajan con productoras y eventos corporativos?', a: 'Sí. Coordinamos membresías para equipos de DJs y discos duros precargados de 1 TB y 2 TB. Escríbenos para cotizar.' },
      { q: '¿Qué pasa si quiero cambiar de plan?', a: 'Puedes pasar de Premium a Exclusivo cuando quieras. Escríbenos por WhatsApp y te indicamos cómo hacerlo.' }
    ];
    var faqs = faqData.map(function (f, i) {
      var open = s.faq === i;
      var ic = 'flex: 0 0 34px; width: 34px; height: 34px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; ' + (open ? 'background: #191b30; color: #ffffff;' : 'background: #ff1f1f; color: #191b30;');
      return { q: f.q, a: f.a, open: open, iconStyle: ic, iconPath: open ? 'M5 12h14' : 'M12 5v14M5 12h14', toggle: function () { self.setState({ faq: open ? -1 : i }); } };
    });

    var payments = [
      { label: 'Yape', img: 'assets/img/pay-yape.png', text: '' },
      { label: 'Plin', img: 'assets/img/pay-plin.png', text: '' },
      { label: 'Transferencia bancaria', img: 'assets/img/pay-transfer.png', text: 'Transferencia' },
      { label: 'PayPal', img: 'assets/img/pay-paypal.png', text: '' },
      { label: 'Takenos', img: 'assets/img/pay-takenos.png', text: '' },
      { label: 'Western Union', img: 'assets/img/pay-wu.png', text: '' }
    ].map(function (p) { p.hasText = !!p.text; return p; });

    var selP = s.selPlan || 'exclusivo';
    var planCard = function (id) {
      var on = selP === id;
      return { cls: on ? 'pc pc-on' : 'pc', on: on, pressed: on ? 'true' : 'false',
        pick: function () { self.setState({ selPlan: id }); },
        key: function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); self.setState({ selPlan: id }); } } };
    };

    var tlist = this.trackData();
    var n = tlist.length;
    var cur = s.cur;
    var ready = []; tlist.forEach(function (t, i) { if (t.enc) ready.push(i); });
    var nextIdx = function () {
      if (!ready.length) return (cur + 1) % n;
      if (s.shuffle) { var others = ready.filter(function (i) { return i !== cur; }); return others.length ? others[Math.floor(Math.random() * others.length)] : cur; }
      var after = ready.filter(function (i) { return i > cur; }); return after.length ? after[0] : ready[0];
    };
    var prevIdx = function () {
      if (!ready.length) return (cur - 1 + n) % n;
      var before = ready.filter(function (i) { return i < cur; }); return before.length ? before[before.length - 1] : ready[ready.length - 1];
    };
    var tr = tlist[cur];
    var planStyle = function (pl) { return 'font-size: 11px; font-weight: 600; border-radius: 999px; padding: 3px 9px; ' + (pl === 'Exclusivo' ? 'background: #191b30; color: #ffffff;' : 'background: #ffe8e9; color: #a10a10;'); };
    var tracks = tlist.map(function (t, i) {
      var on = i === cur;
      return {
        num: (i + 1 < 10 ? '0' : '') + (i + 1), title: t.full, editor: t.meta, type: t.type, len: t.len || '—',
        current: on ? 'true' : 'false', eq: on && s.playing, noEq: !(on && s.playing),
        aria: 'Reproducir ' + t.full,
        rowStyle: 'width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 0; border-radius: 12px; cursor: pointer; font: inherit; color: #191b30; min-height: 52px; background: ' + (on ? '#fff1f1' : 'transparent') + ';',
        titleStyle: 'font-size: 14px; font-weight: ' + (on ? '700' : '600') + '; color: ' + (on ? '#a10a10' : '#191b30') + '; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
        pick: function () { self.goTo(i, true); }
      };
    });
    var playerVals = {
      promoClass: s.promoIn ? 'promo-in' : 'promo-pre',
      setPromo: function (el) { self.promoEl = el; },
      onPromoMove: function (e) {
        var el = self.promoEl; if (!el || self.reduced || window.innerWidth < 960) return;
        var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = 'perspective(1000px) rotateY(' + (x * 8).toFixed(2) + 'deg) rotateX(' + (-y * 8).toFixed(2) + 'deg) scale(1.02)';
      },
      onPromoLeave: function () { if (self.promoEl) self.promoEl.style.transform = ''; },
      setAudio: function (el) { self.audio = el; if (el) { el.volume = s.vol; el.muted = s.muted; } },
      tracks: tracks, trackCount: n, readyCount: ready.length,
      track: { title: tr.full, editor: 'Edición exclusiva DJ Music Perú', type: tr.type, plan: tr.bpm ? tr.bpm + ' BPM' : '', planStyle: tr.bpm ? 'font-size: 11px; font-weight: 600; border-radius: 999px; padding: 3px 9px; background: #191b30; color: #ffffff;' : 'display: none' },
      playing: s.playing, paused: !s.playing, playLabel: s.playing ? 'Pausar' : 'Reproducir',
      statusLabel: s.loading ? 'Cargando…' : (s.playing ? 'Sonando ahora' : 'Vista previa'),
      time: s.time, dur: s.dur || 1, timeLabel: this.fmt(s.time), durLabel: (tr.enc && s.dur) ? this.fmt(s.dur) : (tr.len || '0:00'),
      muted: s.muted, unmuted: !s.muted, muteLabel: s.muted ? 'Activar sonido' : 'Silenciar', volShown: s.muted ? 0 : s.vol,
      shuffleOn: s.shuffle ? 'true' : 'false', repeatOn: s.repeat ? 'true' : 'false',
      shuffleColor: s.shuffle ? 'color: #e3121a' : 'color: #8a909c', repeatColor: s.repeat ? 'color: #e3121a' : 'color: #8a909c',
      hasNotice: !!s.notice, notice: s.notice,
      toggle: function () { if (s.playing && self.audio) self.audio.pause(); else self.playNow(); },
      prev: function () { if (self.audio && !self.silent && self.loadedIdx === cur && self.audio.currentTime > 3) { self.audio.currentTime = 0; return; } self.goTo(prevIdx(), s.playing); },
      next: function () { self.goTo(nextIdx(), s.playing); },
      toggleShuffle: function () { self.setState({ shuffle: !s.shuffle }); },
      toggleRepeat: function () { self.setState({ repeat: !s.repeat }); },
      toggleMute: function () { var m = !s.muted; if (self.audio) self.audio.muted = m; self.setState({ muted: m }); },
      onVol: function (e) { var v = parseFloat(e.target.value); if (self.audio) { self.audio.volume = v; self.audio.muted = v === 0; } self.setState({ vol: v, muted: v === 0 }); },
      onSeek: function (e) { var v = parseFloat(e.target.value); if (self.audio && self.loadedIdx === cur && !self.silent) self.audio.currentTime = v; self.setState({ time: v }); },
      onTime: function (e) { if (self.silent) return; self.setState({ time: e.target.currentTime }); },
      onMeta: function (e) { if (self.silent) return; if (isFinite(e.target.duration)) self.setState({ dur: e.target.duration }); },
      onPlay: function () { if (self.silent) return; self.setState({ playing: true }); },
      onPause: function () { if (self.silent) return; self.setState({ playing: false }); },
      onEnded: function () { if (self.silent) return; if (s.repeat && self.audio) { self.audio.currentTime = 0; self.playNow(); } else { self.goTo(nextIdx(), true); } }
    };
    return Object.assign(playerVals, {
      name: s.name,
      onName: function (e) { self.setState({ name: e.target.value }); },
      waLink: waLink,
      waPremium: this.wa('Hola, quiero la Membresía Premium ' + (annual ? 'anual (S/100).' : 'mensual (S/15).') + who),
      waExclusivo: this.wa('Hola, quiero la Membresía Exclusiva ' + (annual ? 'anual (S/150).' : 'mensual (S/20).') + who),
      waPromo: this.wa('Hola, quiero información de la Promo Octubre 2026.' + who),
      waDisco: this.wa('Hola, quiero cotizar un disco duro precargado.'),
      heroPlans: heroPlans,
      heroSummary: heroSummary,
      isPremium: s.plan === 'premium',
      isExclusive: s.plan !== 'premium',
      premiumIncl: premiumIncl,
      exclusiveIncl: exclusiveIncl,
      editors: ['Aaron García 2026', 'Aldo Cueva', 'DJ Alex Contreras', 'DJ Andre V!P', 'DJ Anthony', 'DJ Blansy', 'DJ Boution 2026', 'DJ Bryan Coloma', 'DJ Cantaro CTRV!P', 'Capo DJ', 'DJ Carlos Kou', 'Carlos Lizano', 'DJ Cosmo', 'DJ Daniel 2026', 'DJ Dave Aguilar', 'DJ Deyvid', 'Diego Cruz (Spr!te)', 'DJ Elmer M!X', 'DJ Finger', 'Gustavo Cabrera', 'DJ Harol 2026', 'Jerson M!X', 'Jesus Olivera', 'DJ Jofers 2026', 'Jordin Silva', 'Juan Saavedra', 'Julinho 2026', 'Junior Poicon', 'Karlos Cueva', 'DJ Lenox', 'DJ Lex Mendoza', 'DJ Luamix', 'Luis DJ', 'DJ Mars', 'DJ Matt', 'Oliver Remixer', 'Olix DJ', 'Renzo Cuba', 'DJ Retro', 'DJ RGM!X', 'DJ Richard Perú', 'DJ Ricky', 'DJ Robin Ramos', 'Rodrigo CS', 'Rolando Cespedes', 'Rolando Rodriguez', 'DJ Sandunga', 'DJ Tesh', 'Thiago Loza', 'DJ Tuszo 2026', 'Wilder Rm-X', 'DJ William Valdivia', 'DJ Wonder M!X', 'Xino Studio'],
      roles: roles,
      role: roleOut,
      diskSizes: diskSizes,
      goDisk: function () { self.setState({ role: 2 }); },
      cats: cats,
      cat: cat,
      weekBars: weekBars,
      formats: ['Intro', 'Mashup', 'Puentes', 'Open show', 'Acapella Splice', 'Pases', 'Virales', 'FX'],
      testis: tData.map(function (x, i) { return Object.assign({}, x, { on: i === s.t }); }),
      tDir: s.tDir === 'prev' ? 't-in-prev' : 't-in-next',
      tProgress: (s.tPaused || this.reduced) ? 'animation-play-state: paused' : 'animation-play-state: running',
      tDots: tData.map(function (x, i) {
        var on = i === s.t;
        return { label: 'Testimonio ' + (i + 1), current: on ? 'true' : 'false', pick: function () { self.goT(i, i < s.t ? 'prev' : 'next'); },
          style: 'display: block; height: 8px; border-radius: 999px; transition: width .3s ease, background .3s ease; width: ' + (on ? '28px' : '8px') + '; background: ' + (on ? '#ff1f1f' : '#c9cdd4') + ';' };
      }),
      prevT: function () { self.goT((s.t + tData.length - 1) % tData.length, 'prev'); },
      nextT: function () { self.goT((s.t + 1) % tData.length, 'next'); },
      pauseT: function () { self.setState({ tPaused: true }); },
      resumeT: function () { self.setState({ tPaused: false }); },
      compare: [
        { k: 'Música nueva cada semana', a: 'Irregular, a veces se repite', b: 'Depende de cada editor', c: 'Martes, viernes y sábado' },
        { k: 'Versiones exclusivas y privadas', a: 'Pocas o ninguna', b: 'Pagando cada una', c: 'Incluidas en Exclusivo' },
        { k: 'Editores top del Perú', a: 'Uno o dos', b: 'Buscas a cada uno', c: '50+ en un solo lugar' },
        { k: 'Intros, mashups, puentes y open show', a: 'Incompleto', b: 'Por separado', c: 'Todo incluido' },
        { k: 'Acceso', a: 'Variable', b: 'Por compra', c: 'Inmediato, link permanente' },
        { k: 'Costo', a: 'Variable', b: 'Pagas tema por tema', c: 'Desde S/15 al mes' }
      ],
      billings: billings,
      per: annual ? '/ año' : '/ mes',
      pPrice: annual ? 'S/100' : 'S/15',
      ePrice: annual ? 'S/150' : 'S/20',
      pNote: annual ? 'Ahorras S/80 frente a 12 meses' : 'Acceso completo',
      eNote: annual ? 'Ahorras S/90 frente a 12 meses' : 'Acceso completo',
      premiumFeat: ['Todos los géneros: actuales, retro y virales', 'Ediciones premium', 'Intro, mashup, puentes y open show', 'Actualización martes y viernes', '80 packs nuevos cada semana'],
      exclusiveFeat: ['Todo el plan Premium', 'Ediciones exclusivas y privadas de editores top', 'Audio de alta fidelidad', 'Acapellas Splice', 'Actualización martes, viernes y sábado', '90 packs nuevos cada semana + bonus VIP'],
      promo: [
        { k: 'Octubre', v: 'S/20' }, { k: 'Octubre y noviembre', v: 'S/30' }, { k: 'Octubre a diciembre', v: 'S/40' },
        { k: 'Enero a octubre', v: 'S/25' }, { k: 'Anual 2026 (enero a diciembre)', v: 'S/50' }
      ],
      payments: payments,
      ckBanner: !!s.ckBanner, ckCfg: !!s.ckCfg, ckPolicy: !!s.ckPolicy,
      ckAnaOn: s.ckAna ? 'true' : 'false', ckAdsOn: s.ckAds ? 'true' : 'false',
      ckAnaStyle: 'position: relative; flex: 0 0 52px; width: 52px; height: 30px; border-radius: 999px; border: 0; cursor: pointer; transition: background .2s ease; background: ' + (s.ckAna ? '#e3121a' : '#c9cdd4') + ';',
      ckAdsStyle: 'position: relative; flex: 0 0 52px; width: 52px; height: 30px; border-radius: 999px; border: 0; cursor: pointer; transition: background .2s ease; background: ' + (s.ckAds ? '#e3121a' : '#c9cdd4') + ';',
      ckAnaKnob: 'position: absolute; top: 3px; width: 24px; height: 24px; border-radius: 50%; background: #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,.2); transition: left .2s ease; left: ' + (s.ckAna ? '25px' : '3px') + ';',
      ckAdsKnob: 'position: absolute; top: 3px; width: 24px; height: 24px; border-radius: 50%; background: #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,.2); transition: left .2s ease; left: ' + (s.ckAds ? '25px' : '3px') + ';',
      ckToggleAna: function () { self.setState({ ckAna: !s.ckAna }); },
      ckToggleAds: function () { self.setState({ ckAds: !s.ckAds }); },
      ckAcceptAll: function () { self.ckStore(true, true); },
      ckRejectAll: function () { self.ckStore(false, false); },
      ckSave: function () { self.ckStore(s.ckAna, s.ckAds); },
      ckOpenCfg: function () { self.setState({ ckCfg: true, ckPolicy: false }); },
      ckOpenPolicy: function () { self.setState({ ckPolicy: true, ckCfg: false }); },
      ckClose: function () { self.setState({ ckCfg: false, ckPolicy: false, ckBanner: !self.ckLoad() }); },
      ckOverlayClick: function (e) { if (e.target === e.currentTarget) self.setState({ ckCfg: false, ckPolicy: false, ckBanner: !self.ckLoad() }); },
      ckKey: function (e) { if (e.key === 'Escape') self.setState({ ckCfg: false, ckPolicy: false, ckBanner: !self.ckLoad() }); },
      menuOpen: !!s.menuOpen, menuClosed: !s.menuOpen, menuOpenStr: s.menuOpen ? 'true' : 'false', menuLabel: s.menuOpen ? 'Cerrar menú' : 'Abrir menú',
      toggleMenu: function () { self.setState({ menuOpen: !s.menuOpen }); },
      closeMenu: function () { self.setState({ menuOpen: false }); },
      goDiskMenu: function () { self.setState({ menuOpen: false, role: 2 }); },
      menuKey: function (e) { if (e.key === 'Escape') self.setState({ menuOpen: false }); },
      cPrem: planCard('premium'), cExcl: planCard('exclusivo'), cPromo: planCard('promo'),
      faqs: faqs
    });
  }
}
window.Component = Component;
