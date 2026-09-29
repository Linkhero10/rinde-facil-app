/* Rinde Fácil — pantallas de la cuenta: crear cuenta, entrar, recuperar contraseña, equipo nuevo y la herramienta «Seguridad». */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, h = U.h, C = RF.crypto, A = RF.auth, V = RF.vault;
  var TOOLS = RF.tools = RF.tools || {};

  /* ---------- piezas ---------- */
  function passField(label, opts) {
    opts = opts || {};
    var input = h('input', { type: 'password', autocomplete: opts.autocomplete || 'current-password', required: true, id: opts.id || null, 'aria-describedby': opts.describedby || null, spellcheck: 'false', autocapitalize: 'off' });
    var eye = h('button', { type: 'button', class: 'pw-eye', 'aria-label': 'Mostrar u ocultar la contraseña', onclick: function () { input.type = input.type === 'password' ? 'text' : 'password'; } }, UI.icon('eye', 16));
    return { input: input, node: h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), h('div', { class: 'pw-row' }, input, eye), opts.hint ? h('span', { class: 'hint' }, opts.hint) : null) };
  }
  function textField(label, opts) {
    opts = opts || {};
    var input = h('input', { type: 'text', autocomplete: opts.autocomplete || 'username', required: true, spellcheck: 'false', value: opts.value || '', id: opts.id || null });
    return { input: input, node: h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), input, opts.hint ? h('span', { class: 'hint' }, opts.hint) : null) };
  }
  function shell(title, lead, kids) {
    return h('main', { class: 'auth-wrap', id: 'main' }, h('div', { class: 'auth-card' }, h('div', { class: 'brand auth-brand' }, 'Rinde Fácil'), h('h1', { class: 'auth-title' }, title), lead ? h('p', { class: 'lead' }, lead) : null, kids));
  }
  function work(promise, label) {
    var b = UI.busy(label || 'Abriendo…', [{ id: 'k', label: 'Verificando la contraseña. Puede tardar unos segundos…', from: 0, to: 90, tau: 2 }]);
    return promise.then(function (r) { b.done('Listo'); return r; }, function (e) { b.fail(e && e.message ? e.message : 'No se pudo'); throw e; });
  }
  function errBox() { return h('div', { class: 'auth-err', role: 'alert' }); }
  function showErr(box, msg) { U.clear(box); if (msg) box.appendChild(UI.callout('bad', '', msg)); }

  /* ---------- código de recuperación ---------- */
  function recoveryScreen(code, then) {
    var ok = h('input', { type: 'checkbox', id: 'recok' });
    var go = UI.btn('Continuar', { cls: 'primary big', onclick: function () { then(); } }); go.disabled = true;
    ok.addEventListener('change', function () { go.disabled = !ok.checked; });
    return shell('Guarda tu código de recuperación', 'Si algún día olvidas la contraseña, este código es la única forma de abrir los datos de este equipo. Anótalo en papel y guárdalo en un lugar seguro. No lo compartas por WhatsApp ni lo saques en foto.', [
      h('div', { class: 'recovery-code', 'aria-label': 'Código de recuperación' }, code),
      h('div', { class: 'row-actions' }, UI.btn('Copiar', { icon: 'copy', cls: 'ghost', onclick: function () { U.copyText(code).then(function (okc) { UI.toast(okc ? 'Código copiado.' : 'No se pudo copiar; anótalo a mano.', okc ? 'ok' : 'bad'); }); } }),
        UI.btn('Imprimir', { icon: 'pdf', cls: 'ghost', onclick: function () { RF.exp.printDoc({ title: 'Código de recuperación de Rinde Fácil', subtitle: (V.user() || ''), blocks: [{ t: 'p', text: 'Guárdalo en un lugar seguro. Quien tenga este código puede abrir los datos de la comunidad.' }, { t: 'kv', rows: [['Código', code]] }], footer: 'Generado el ' + U.fmtDate(U.todayISO()) + '.' }); } })),
      h('label', { class: 'check', for: 'recok' }, ok, h('span', null, 'Ya guardé mi código en un lugar seguro')), go]);
  }

  /* ---------- crear cuenta (o proteger los datos que ya había) ---------- */
  function createScreen(legacy, onDone) {
    var name = textField('Nombre de la comunidad', { hint: 'Este es el «usuario» con el que entras.', value: (legacy && legacy.community && legacy.community.name) || '' });
    var p1 = passField('Contraseña', { autocomplete: 'new-password', hint: 'Al menos 10 caracteres. Una frase de tres o cuatro palabras funciona bien.' });
    var p2 = passField('Repite la contraseña', { autocomplete: 'new-password' });
    var err = errBox(), hints = h('ul', { class: 'pw-hints', 'aria-live': 'polite' });
    function upd() { U.clear(hints); C.passwordProblems(p1.input.value, name.input.value).forEach(function (m) { hints.appendChild(h('li', null, m)); }); }
    p1.input.addEventListener('input', upd); name.input.addEventListener('input', upd);
    var form = h('form', { class: 'auth-form', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); showErr(err, '');
      var nm = name.input.value.trim();
      if (nm.length < 3) return showErr(err, 'Escribe el nombre de la comunidad.');
      var pr = C.passwordProblems(p1.input.value, nm); if (pr.length) return showErr(err, pr[0]);
      if (p1.input.value !== p2.input.value) return showErr(err, 'Las dos contraseñas no son iguales.');
      work(A.createAccount(nm, p1.input.value), 'Creando tu cuenta…').then(function (r) { onDone(r); }).catch(function (e) { showErr(err, e.message); });
    } }, name.node, p1.node, hints, p2.node, err, h('button', { type: 'submit', class: 'btn primary big' }, legacy ? 'Proteger mis datos' : 'Crear cuenta'));
    return shell(legacy ? 'Protege los datos de tu comunidad' : 'Crea la cuenta de tu comunidad',
      legacy ? 'Tus datos de antes se van a guardar cifrados con una contraseña. Elige una que puedas recordar; sin ella nadie podrá abrirlos, ni siquiera nosotros.' : 'La contraseña protege lo que guardas en este equipo: gastos, fotos y documentos. Nadie más puede abrirlo sin ella.',
      [form, h('p', { class: 'hint' }, 'Los datos se guardan cifrados en este equipo y, si conectas el servicio de tu comunidad, en el Drive de tu comunidad.'), h('button', { type: 'button', class: 'linklike', onclick: function () { A.goto('connect'); } }, 'Ya tengo un servicio de mi comunidad y este equipo es nuevo')]);
  }

  /* ---------- entrar ---------- */
  function lockScreen(reason) {
    var m = V.meta() || {};
    var name = textField('Comunidad', { value: m.display || '' });
    var pw = passField('Contraseña');
    var err = errBox();
    var form = h('form', { class: 'auth-form', onsubmit: function (ev) {
      ev.preventDefault(); showErr(err, '');
      work(A.unlock(name.input.value, pw.input.value), 'Abriendo…').catch(function (e) { showErr(err, e.message); pw.input.value = ''; pw.input.focus(); });
    } }, name.node, pw.node, err, h('button', { type: 'submit', class: 'btn primary big' }, 'Entrar'));
    setTimeout(function () { (name.input.value ? pw.input : name.input).focus(); }, 30);
    return shell('Entra a Rinde Fácil', reason === 'inactividad' ? 'La sesión se cerró porque estuvo un rato sin usarse. Tus datos siguen guardados.' : 'Escribe el nombre de tu comunidad y tu contraseña.',
      [form, h('button', { type: 'button', class: 'linklike', onclick: function () { A.goto('recover'); } }, 'Olvidé mi contraseña')]);
  }

  /* ---------- recuperar ---------- */
  function recoverScreen() {
    var code = textField('Código de recuperación', { autocomplete: 'off', hint: 'Los 26 caracteres que guardaste al crear la cuenta.' });
    var p1 = passField('Contraseña nueva', { autocomplete: 'new-password' }), p2 = passField('Repite la contraseña nueva', { autocomplete: 'new-password' });
    var err = errBox();
    var form = h('form', { class: 'auth-form', onsubmit: function (ev) {
      ev.preventDefault(); showErr(err, '');
      if (p1.input.value !== p2.input.value) return showErr(err, 'Las dos contraseñas no son iguales.');
      work(A.recover(code.input.value, p1.input.value), 'Recuperando…').then(function (r) { A.goto('recovery', r.recoveryCode); }).catch(function (e) { showErr(err, e.message); });
    } }, code.node, p1.node, p2.node, err, h('button', { type: 'submit', class: 'btn primary big' }, 'Cambiar contraseña'));
    return shell('Recuperar el acceso', 'Con el código de recuperación puedes elegir una contraseña nueva sin perder tus datos.', [form, h('button', { type: 'button', class: 'linklike', onclick: function () { A.goto('lock'); } }, 'Volver')]);
  }

  /* ---------- equipo nuevo ---------- */
  function connectScreen() {
    var url = textField('Dirección del servicio (termina en /exec)', { autocomplete: 'off' });
    var name = textField('Nombre de la comunidad'), pw = passField('Contraseña');
    var err = errBox();
    var form = h('form', { class: 'auth-form', onsubmit: function (ev) {
      ev.preventDefault(); showErr(err, '');
      work(A.connectDevice(url.input.value.trim(), name.input.value, pw.input.value), 'Conectando…').then(function () { }).catch(function (e) { showErr(err, e.message); });
    } }, url.node, name.node, pw.node, err, h('button', { type: 'submit', class: 'btn primary big' }, 'Conectar este equipo'));
    return shell('Conectar este equipo', 'Usa la dirección del servicio y la contraseña de tu comunidad. Se traerán los datos guardados en el Drive y se protegerán en este equipo.', [form, h('button', { type: 'button', class: 'linklike', onclick: function () { A.goto('none'); } }, 'Volver')]);
  }

  function insecureScreen() {
    return shell('Abre Rinde Fácil desde una dirección segura', 'Este navegador no permite proteger los datos con contraseña cuando la página no es https. Abre la dirección oficial de Rinde Fácil (empieza con https://).', null);
  }

  /* ---------- qué pantalla toca ---------- */
  var view = null, arg = null;
  function screen(phase) {
    if (phase === 'insecure') return insecureScreen();
    if (view === 'recovery') return recoveryScreen(arg, function () { view = null; arg = null; A.touch(); RF.app.render(); });
    if (view === 'connect') return connectScreen();
    if (view === 'recover' && phase === 'locked') return recoverScreen();
    if (view === 'lock' && phase === 'locked') return lockScreen(A.reason());
    if (phase === 'locked') return lockScreen(A.reason());
    return createScreen(phase === 'legacy' ? V.legacyState() : null, function (r) { view = 'recovery'; arg = r.recoveryCode; RF.app.render(); });
  }
  A.goto = function (v, a) { view = v; arg = a || null; RF.app.render(); };
  RF.authui = { screen: screen, pending: function () { return view === 'recovery'; } };

  /* ================= herramienta «Seguridad» ================= */
  TOOLS.seguridad = { title: 'Seguridad', icon: 'shield', desc: 'Cambia la contraseña, cierra sesiones, mira quién entró y revisa que todo esté protegido.', render: function () {
    var s = RF.store.get(), root = h('div', { class: 'tool-page' }, h('h1', { class: 'tool-title' }, 'Seguridad'), h('p', { class: 'lead' }, 'Todo lo que guardas en este equipo está cifrado con la contraseña de tu comunidad.'));
    var status = h('div'), log = h('div'), out = h('div');
    function msg(kind, t) { U.clear(out); out.appendChild(UI.callout(kind, '', t)); }
    function paintStatus() {
      U.clear(status);
      var m = V.meta() || {}, tk = A.token();
      var rows = [
        ['Datos de este equipo cifrados (AES-256)', true, 'Sin la contraseña o el código de recuperación no se pueden abrir.'],
        ['Código de recuperación', !!m.wrapR, m.wrapR ? 'Existe. Si lo perdiste, cambia la contraseña y se genera uno nuevo.' : 'Este equipo no tiene uno (se conectó a un servicio ya creado).'],
        ['Servicio de la comunidad', RF.cloud.configured(), RF.cloud.configured() ? (tk ? 'Sesión abierta.' : 'Sin sesión todavía (se abre sola al usarlo).') : 'No conectado.'],
        ['Cierre por inactividad', true, (Number(s.ui.idleMinutes) || 15) + ' minutos']
      ];
      status.appendChild(h('ul', { class: 'sec-list' }, rows.map(function (r) { return h('li', { class: r[1] ? 'ok' : 'warn' }, h('span', { class: 'sec-ico' }, UI.icon(r[1] ? 'check' : 'alert', 18)), h('span', null, h('strong', null, r[0]), h('span', { class: 'muted small' }, ' · ' + r[2]))); })));
    }
    paintStatus();
    root.appendChild(UI.section('Estado', [status]));

    var idle = UI.field('Cerrar la sesión si no la usas por', s.ui, 'idleMinutes', { type: 'select', noEmpty: true, options: [{ id: 5, name: '5 minutos' }, { id: 15, name: '15 minutos' }, { id: 30, name: '30 minutos' }, { id: 60, name: '1 hora' }], onChange: function (v) { s.ui.idleMinutes = Number(v); RF.store.update(function () { }, { silent: true }); paintStatus(); } });
    root.appendChild(UI.section('Esta sesión', [idle, h('div', { class: 'row-actions' },
      UI.btn('Bloquear ahora', { icon: 'shield', cls: 'primary', onclick: function () { A.lock('manual'); } }),
      RF.cloud.configured() ? UI.btn('Cerrar sesión en todos los dispositivos', { icon: 'close', cls: 'ghost', onclick: function () { A.logoutServer(true).then(function () { msg('ok', 'Se cerraron las sesiones con el servicio. Cada dispositivo tendrá que volver a entrar.'); paintStatus(); }); } }) : null)]));

    /* cambiar contraseña */
    var o = passField('Contraseña actual'), n1 = passField('Contraseña nueva', { autocomplete: 'new-password', hint: 'Al menos 10 caracteres.' }), n2 = passField('Repite la contraseña nueva', { autocomplete: 'new-password' });
    root.appendChild(UI.section('Cambiar la contraseña', [h('form', { class: 'auth-form', onsubmit: function (ev) {
      ev.preventDefault();
      if (n1.input.value !== n2.input.value) return msg('bad', 'Las dos contraseñas nuevas no son iguales.');
      var old = o.input.value, nw = n1.input.value;
      work(V.changePassword(old, nw).then(function () { return RF.cloud.configured() ? A.serverChangePassword(old, nw).catch(function (e) { return { warn: e.message }; }) : null; }), 'Cambiando…').then(function (r) {
        o.input.value = n1.input.value = n2.input.value = '';
        msg(r && r.warn ? 'warn' : 'ok', r && r.warn ? 'La contraseña cambió en este equipo, pero el servicio dijo: ' + r.warn : 'Listo. Desde ahora usa la contraseña nueva; las sesiones de los demás dispositivos se cerraron.');
      }).catch(function (e) { msg('bad', e.message); });
    } }, o.node, n1.node, n2.node, h('button', { type: 'submit', class: 'btn' }, 'Cambiar contraseña'))]));
    root.appendChild(out);

    /* registro de accesos */
    function loadLog() {
      U.clear(log); log.appendChild(UI.empty('Cargando…'));
      RF.cloud.post('audit', {}, 30000).then(function (r) {
        U.clear(log);
        if (!r || !r.ok) { log.appendChild(UI.empty('No se pudo leer el registro.')); return; }
        var names = { login: 'Entró', login_fail: 'Intento fallido', setup: 'Se creó la cuenta', setup_fail: 'Código de instalación incorrecto', change_password: 'Cambió la contraseña', change_fail: 'Intento fallido al cambiar la contraseña', reset: 'Recuperó la cuenta', reset_fail: 'Recuperación fallida', logout_all: 'Cerró todas las sesiones' };
        log.appendChild(h('table', { class: 'plain-grid' }, h('thead', null, h('tr', null, h('th', null, 'Cuándo'), h('th', null, 'Qué pasó'))), h('tbody', null, r.log.map(function (e) { return h('tr', { class: e.ok ? '' : 'row-bad' }, h('td', null, new Date(e.t).toLocaleString('es-CL')), h('td', null, names[e.e] || e.e)); }))));
      }).catch(function (e) { U.clear(log); log.appendChild(UI.empty('No se pudo leer el registro (' + (e.message || e) + ').')); });
    }
    if (RF.cloud.configured()) root.appendChild(UI.section('Quién entró al servicio', [h('p', { class: 'hint' }, 'Los últimos accesos. Si ves algo que no reconoces, cambia la contraseña y cierra todas las sesiones.'), UI.btn('Ver el registro', { icon: 'list', cls: 'ghost', onclick: loadLog }), log]));

    root.appendChild(UI.section('Si pierdes o cambias de equipo', [h('p', { class: 'hint' }, 'Puedes borrar todos los datos de este equipo. Lo que esté en el Drive de la comunidad no se toca. Después puedes volver a conectarte con la contraseña.'),
      UI.btn('Borrar los datos de este equipo', { icon: 'trash', cls: 'ghost danger', onclick: function () { UI.confirmBox('Se borrarán proyectos, fotos y ajustes de ESTE equipo y tendrás que crear o conectar la cuenta otra vez. Lo del Drive no se borra. ¿Seguir?', 'Borrar todo').then(function (ok) { if (ok) A.wipeDevice().then(function () { location.hash = '#/'; location.reload(); }); }); } })]));
    return root;
  } };
})(typeof window !== 'undefined' ? window : globalThis);
