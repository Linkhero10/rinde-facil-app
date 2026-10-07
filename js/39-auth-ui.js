/* Rinde Fácil — pantallas de la cuenta: crear cuenta, entrar, recuperar contraseña, equipo nuevo y la herramienta «Seguridad». */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, h = U.h, C = RF.crypto, A = RF.auth, V = RF.vault;
  var TOOLS = RF.tools = RF.tools || {};

  /* ---------- piezas ---------- */
  function passField(label, opts) {
    opts = opts || {};
    var input = h('input', { type: 'password', autocomplete: opts.autocomplete || 'current-password', required: opts.required !== false, id: opts.id || null, 'aria-describedby': opts.describedby || null, spellcheck: 'false', autocapitalize: 'off' });
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
  /* si el error trae una espera (retryAfter del servicio o seconds de la bóveda), el aviso cuenta hacia atrás cada segundo */
  var tickers = new WeakMap();
  function showErr(box, msg, e) {
    if (tickers.has(box)) { clearInterval(tickers.get(box)); tickers.delete(box); }
    U.clear(box); if (!msg) return;
    var total = e && Number(e.retryAfter || e.seconds);
    if (!(total > 0)) { box.appendChild(UI.callout('bad', '', msg)); return; }
    var end = Date.now() + total * 1000, node = UI.callout('bad', '', ''), span = node;
    node.setAttribute('role', 'timer');
    function paint() {
      var left = Math.ceil((end - Date.now()) / 1000);
      if (left <= 0) { span.textContent = 'Ya pasó la espera. Puedes intentarlo de nuevo.'; clearInterval(id); tickers.delete(box); return; }
      span.textContent = 'Pausa de seguridad: faltan ' + U.waitText(left) + ' para volver a intentar.';
    }
    var id = setInterval(function () { if (!node.isConnected) { clearInterval(id); tickers.delete(box); return; } paint(); }, 1000);
    tickers.set(box, id); box.appendChild(node); paint();
  }
  function passwordChecklist(passwordInput, communityInput, id) {
    var list = h('ul', { class: 'pw-hints', id: id, 'aria-label': 'Requisitos de la contraseña' }), parts = [];
    function communityName() { return communityInput && communityInput.value !== undefined ? communityInput.value : (communityInput || ''); }
    function update() {
      C.passwordChecks(passwordInput.value, communityName()).forEach(function (check, i) {
        var part = parts[i];
        part.row.className = 'pw-check ' + (check.valid ? 'is-met' : 'is-missing');
        part.row.textContent = check.label;
        part.row.setAttribute('aria-label', check.label + (check.valid ? ': cumplido' : ': pendiente'));
      });
    }
    C.passwordChecks('', '').forEach(function (check) {
      var row = h('li', { class: 'pw-check is-missing' }, check.label);
      parts.push({ row: row });
      list.appendChild(row);
    });
    passwordInput.addEventListener('input', update);
    if (communityInput && communityInput.addEventListener) communityInput.addEventListener('input', update);
    update();
    return { node: list, update: update };
  }
  function passwordConfirmation(passwordInput, confirmation, id) {
    var feedback = h('span', { class: 'pw-match', id: id, 'aria-live': 'polite' });
    var attempted = false;
    function update() {
      var typed = confirmation.input.value.length > 0;
      var matches = typed && passwordInput.value === confirmation.input.value;
      feedback.className = 'pw-match' + (typed || attempted ? (matches ? ' is-met' : ' is-missing') : '');
      feedback.textContent = !typed ? 'Vuelve a escribir tu contraseña.' : matches ? 'Las contraseñas coinciden.' : 'Las contraseñas todavía no coinciden.';
      confirmation.input.setAttribute('aria-invalid', (typed || attempted) && !matches ? 'true' : 'false');
    }
    function validate() {
      attempted = true; update();
      if (!confirmation.input.value || passwordInput.value !== confirmation.input.value) { confirmation.input.focus(); return false; }
      return true;
    }
    confirmation.node.appendChild(feedback);
    passwordInput.addEventListener('input', update);
    confirmation.input.addEventListener('input', update);
    update();
    return { update: update, validate: validate, reset: function () { attempted = false; update(); } };
  }

  /* ---------- código de recuperación ---------- */
  function recoveryScreen(code, then, warning) {
    var ok = h('input', { type: 'checkbox', id: 'recok' });
    var go = UI.btn('Continuar', { cls: 'primary big', onclick: function () { then(); } }); go.disabled = true;
    ok.addEventListener('change', function () { go.disabled = !ok.checked; });
    return shell('Guarda tu código de recuperación', 'Si algún día olvidas la contraseña, este código es la única forma de abrir los datos de este equipo. Anótalo en papel y guárdalo en un lugar seguro. No lo compartas por WhatsApp ni lo saques en foto.', [
      warning ? UI.callout('warn', 'El servicio sigue con la contraseña anterior', warning) : null,
      h('div', { class: 'recovery-code', 'aria-label': 'Código de recuperación' }, code),
      h('div', { class: 'row-actions' }, UI.btn('Copiar', { icon: 'copy', cls: 'ghost', onclick: function () { U.copyText(code).then(function (okc) { UI.toast(okc ? 'Código copiado.' : 'No se pudo copiar; anótalo a mano.', okc ? 'ok' : 'bad'); }); } }),
        UI.btn('Imprimir', { icon: 'pdf', cls: 'ghost', onclick: function () { RF.exp.printDoc({ title: 'Código de recuperación de Rinde Fácil', subtitle: (V.user() || ''), blocks: [{ t: 'p', text: 'Guárdalo en un lugar seguro. Quien tenga este código puede abrir los datos de la comunidad.' }, { t: 'kv', rows: [['Código', code]] }], footer: 'Generado el ' + U.fmtDate(U.todayISO()) + '.' }); } })),
      h('label', { class: 'check', for: 'recok' }, ok, h('span', null, 'Ya guardé mi código en un lugar seguro')), go]);
  }

  /* ---------- crear cuenta (o proteger los datos que ya había) ---------- */
  function createScreen(legacy, onDone) {
    var name = textField('Nombre de la comunidad', { hint: 'Este es el «usuario» con el que entras.', value: (legacy && legacy.community && legacy.community.name) || '' });
    var reqId = 'create-password-requirements';
    var p1 = passField('Contraseña', { autocomplete: 'new-password', describedby: reqId, hint: 'Al menos 10 caracteres. Una frase de tres o cuatro palabras funciona bien.' });
    var p2 = passField('Repite la contraseña', { autocomplete: 'new-password', required: false, describedby: 'create-password-match' });
    var matchHint = passwordConfirmation(p1.input, p2, 'create-password-match');
    var err = errBox(), hints = passwordChecklist(p1.input, name.input, reqId);
    var form = h('form', { class: 'auth-form', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); showErr(err, '');
      var nm = name.input.value.trim();
      if (nm.length < 3) return showErr(err, 'Escribe el nombre de la comunidad.');
      var pr = C.passwordProblems(p1.input.value, nm); if (pr.length) return showErr(err, pr[0]);
      if (!matchHint.validate()) return;
      work(A.createAccount(nm, p1.input.value), 'Creando tu cuenta…').then(function (r) { onDone(r); }).catch(function (e) { showErr(err, e.message, e); });
    } }, name.node, p1.node, hints.node, p2.node, err, h('button', { type: 'submit', class: 'btn primary big' }, legacy ? 'Proteger mis datos' : 'Crear cuenta'));
    return shell(legacy ? 'Protege los datos de tu comunidad' : 'Crea la cuenta de tu comunidad',
      legacy ? 'Tus datos de antes se van a guardar cifrados con una contraseña. Elige una que puedas recordar; sin ella nadie podrá abrirlos, ni siquiera nosotros.' : 'La contraseña protege lo que guardas en este equipo: gastos, fotos y documentos. Nadie más puede abrirlo sin ella.',
      [form, h('p', { class: 'hint' }, 'Los datos se guardan cifrados en este equipo y, si conectas el servicio de tu comunidad, en el Drive de tu comunidad.'), h('button', { type: 'button', class: 'linklike', onclick: function () { A.goto('connect'); } }, approvedList().length ? 'Ya tengo cuenta: entrar en este equipo con mi nombre y contraseña' : 'Ya tengo un servicio de mi comunidad y este equipo es nuevo')]);
  }

  /* ---------- entrar ---------- */
  function lockScreen(reason) {
    var m = V.meta() || {};
    var name = textField('Comunidad', { value: m.display || '' });
    var pw = passField('Contraseña');
    var err = errBox();
    var form = h('form', { class: 'auth-form', onsubmit: function (ev) {
      ev.preventDefault(); showErr(err, '');
      work(A.unlock(name.input.value, pw.input.value), 'Abriendo…').catch(function (e) { showErr(err, e.message, e); pw.input.value = ''; pw.input.focus(); });
    } }, name.node, pw.node, err, h('button', { type: 'submit', class: 'btn primary big' }, 'Entrar'));
    setTimeout(function () { (name.input.value ? pw.input : name.input).focus(); }, 30);
    return shell('Entra a Rinde Fácil', reason === 'inactividad' ? 'La sesión se cerró porque estuvo un rato sin usarse. Tus datos siguen guardados.' : 'Escribe el nombre de tu comunidad y tu contraseña.',
      [form, h('button', { type: 'button', class: 'linklike', onclick: function () { A.goto('recover'); } }, 'Olvidé mi contraseña')]);
  }

  /* ---------- recuperar ---------- */
  function recoverScreen() {
    var code = textField('Código de recuperación', { autocomplete: 'off', hint: 'Los 26 caracteres que guardaste al crear la cuenta.' });
    var meta = V.meta() || {}, reqId = 'recover-password-requirements';
    var communityName = meta.display || meta.user || '';
    var p1 = passField('Contraseña nueva', { autocomplete: 'new-password', describedby: reqId });
    var p2 = passField('Repite la contraseña nueva', { autocomplete: 'new-password', required: false, describedby: 'recover-password-match' });
    var matchHint = passwordConfirmation(p1.input, p2, 'recover-password-match');
    var hints = passwordChecklist(p1.input, communityName, reqId);
    var err = errBox();
    var form = h('form', { class: 'auth-form', onsubmit: function (ev) {
      ev.preventDefault(); showErr(err, '');
      var problems = C.passwordProblems(p1.input.value, communityName); if (problems.length) return showErr(err, problems[0]);
      if (!matchHint.validate()) return;
      work(A.recover(code.input.value, p1.input.value), 'Recuperando…').then(function (r) {
        var warning = r.serviceTrustBlocked ? 'La bóveda de este equipo se recuperó, pero la dirección guardada del servicio no está aprobada en esta versión. No se envió el código ni se modificó el acceso remoto. Pide verificar y aprobar la dirección antes de conectar.'
          : r.serverReset === false ? 'La bóveda de este equipo ya cambió y se generó el código nuevo que aparece abajo, pero el servicio remoto no confirmó el restablecimiento. El Drive todavía puede exigir la contraseña anterior. No borres esta sesión ni pierdas el código; vuelve a intentar cuando el servicio esté disponible.'
          : r.serverAccountMissing ? 'La recuperación cambió la bóveda de este equipo, pero el servicio conectado todavía no tiene una cuenta creada. El código de abajo sirve para este equipo; no se modificó ningún acceso remoto.' : '';
        A.goto('recovery', { code: r.recoveryCode, warning: warning });
      }).catch(function (e) {
        if (e && e.code === 'LOCAL_RECOVERY_COMMIT_FAILED_AFTER_REMOTE' && e.recoveryCode) A.goto('recovery', { code: e.recoveryCode, warning: e.message });
        else showErr(err, e.message, e);
      });
    } }, code.node, p1.node, hints.node, p2.node, err, h('button', { type: 'submit', class: 'btn primary big' }, 'Cambiar contraseña'));
    return shell('Recuperar el acceso', 'Con el código de recuperación puedes elegir una contraseña nueva sin perder tus datos.', [form, h('button', { type: 'button', class: 'linklike', onclick: function () { A.goto('lock'); } }, 'Volver')]);
  }

  /* ---------- equipo nuevo ---------- */
  function approvedList() { return RF.cloud && RF.cloud.approvedUrls ? RF.cloud.approvedUrls() : []; }
  function connectScreen() {
    var approved = approvedList();
    var name = textField('Nombre de la comunidad'), pw = passField('Contraseña');
    var err = errBox(), url = null, pick = null;
    if (approved.length > 1) { pick = h('select', { 'aria-label': 'Servicio de tu comunidad' }, approved.map(function (u, i) { return h('option', { value: u }, 'Servicio ' + (i + 1) + ' (…' + u.replace(/\/exec$/, '').slice(-8) + ')'); })); }
    if (!approved.length) url = textField('Dirección del servicio (termina en /exec)', { autocomplete: 'off' });
    var other = approved.length ? textField('Dirección del servicio (termina en /exec)', { autocomplete: 'off' }) : null; if (other) other.input.removeAttribute('required'); /* escondido y obligatorio bloqueaba el envío sin avisar */ /* solo para quien administra el servicio o prueba en su propio equipo */
    var form = h('form', { class: 'auth-form', onsubmit: function (ev) {
      ev.preventDefault(); showErr(err, '');
      var target = other && other.input.value.trim() ? other.input.value.trim() : approved.length === 1 ? approved[0] : pick ? pick.value : url.input.value.trim();
      work(A.connectDevice(target, name.input.value, pw.input.value), 'Conectando…').then(function () { }).catch(function (e) { showErr(err, (RF.cloud && RF.cloud.humanError ? RF.cloud.humanError(e) : e.message), e); });
    } }, pick ? h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Servicio de tu comunidad'), pick) : null, url ? url.node : null, name.node, pw.node, other ? h('details', { class: 'adv' }, h('summary', null, 'Usar otra dirección de servicio'), h('p', { class: 'hint' }, 'Solo si te la entregó quien administra el servicio de tu comunidad. Debe estar aprobada en esta versión de la app.'), other.node) : null, err, h('button', { type: 'submit', class: 'btn primary big' }, 'Entrar en este equipo'));
    var back = h('button', { type: 'button', class: 'linklike', onclick: function () { A.goto('none'); } }, 'Volver');
    if (approved.length) return shell('Entrar en este equipo', 'Escribe el nombre y la contraseña de tu comunidad. Este equipo se conecta al servicio de tu comunidad y trae tus datos; no hace falta pegar ninguna dirección.', [form, back]);
    return shell('Conectar este equipo', 'Esta publicación no trae una dirección de servicio aprobada. No pegues una URL recibida por mensaje: hasta verificar y aprobar el servicio de tu comunidad, Rinde Fácil no enviará contraseñas ni documentos.', [UI.callout('info', 'Servicio aún no configurado', 'La app sigue funcionando en este equipo. La conexión con OCR y Drive se habilitará cuando exista una publicación aprobada para el servicio de tu comunidad.'), form, back]);
  }

  function insecureScreen() {
    return shell('Abre Rinde Fácil desde una dirección segura', 'Este navegador no permite proteger los datos con contraseña cuando la página no es https. Abre la dirección oficial de Rinde Fácil (empieza con https://).', null);
  }

  /* ---------- qué pantalla toca ---------- */
  var view = null, arg = null;
  function screen(phase) {
    if (phase === 'insecure') return insecureScreen();
    if (view === 'recovery') {
      var recovery = arg && typeof arg === 'object' ? arg : { code: arg, warning: '' };
      return recoveryScreen(recovery.code, function () { view = null; arg = null; A.touch(); RF.app.render(); }, recovery.warning);
    }
    if (view === 'connect') return connectScreen();
    if (view === 'recover' && phase === 'locked') return recoverScreen();
    if (view === 'lock' && phase === 'locked') return lockScreen(A.reason());
    if (phase === 'locked') return lockScreen(A.reason());
    return createScreen(phase === 'legacy' ? V.legacyState() : null, function (r) { view = 'recovery'; arg = r.recoveryCode; RF.app.render(); });
  }
  A.goto = function (v, a) { view = v; arg = a || null; RF.app.render(); };
  RF.authui = { showErr: showErr, screen: screen, pending: function () { return view === 'recovery'; } };

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
        ['Código de recuperación', !!m.wrapR, m.wrapR ? 'Existe. Cambiar la contraseña conserva ese código; guárdalo en un lugar seguro.' : 'Este equipo no tiene uno (se conectó a un servicio ya creado).'],
        ['Servicio de la comunidad', RF.cloud.configured(), RF.cloud.configured() ? (tk ? 'Sesión abierta.' : 'Sesión cerrada; se abrirá al usarlo.') : (s.cloud.apiUrl ? 'Dirección no aprobada; no se envían datos.' : 'No conectado.')],
        ['Cierre por inactividad', true, (Number(s.ui.idleMinutes) || 15) + ' minutos']
      ];
      status.appendChild(h('ul', { class: 'sec-list' }, rows.map(function (r) { return h('li', { class: r[1] ? 'ok' : 'warn' }, h('span', { class: 'sec-ico' }, UI.icon(r[1] ? 'check' : 'alert', 18)), h('span', null, h('strong', null, r[0]), h('span', { class: 'muted small' }, ' · ' + r[2]))); })));
    }
    paintStatus();
    root.appendChild(UI.section('Estado', [status]));

    var idle = UI.field('Cerrar la sesión si no la usas por', s.ui, 'idleMinutes', { type: 'select', noEmpty: true, options: [{ id: 5, name: '5 minutos' }, { id: 15, name: '15 minutos' }, { id: 30, name: '30 minutos' }, { id: 60, name: '1 hora' }], onChange: function (v) { s.ui.idleMinutes = Number(v); RF.store.update(function () { }, { silent: true }); paintStatus(); } });
    root.appendChild(UI.section('Esta sesión', [idle, h('div', { class: 'row-actions' },
      UI.btn('Bloquear ahora', { icon: 'shield', cls: 'primary', onclick: function () { A.lock('manual').catch(function () { UI.toast('No se bloqueó la sesión porque los últimos cambios no se guardaron. Revisa el aviso superior y vuelve a intentarlo.', 'bad'); }); } }),
      RF.cloud.configured() ? UI.btn('Cerrar sesión en todos los dispositivos', { icon: 'close', cls: 'ghost', onclick: function () {
        A.logoutServer(true).then(function () { msg('ok', 'El servicio confirmó el cierre de las sesiones. Cada dispositivo tendrá que volver a entrar.'); paintStatus(); })
          .catch(function (e) { msg('bad', 'No se pudo confirmar el cierre de las sesiones: ' + (e.message || e)); });
      } }) : null)]));

    /* cambiar contraseña */
    var accountMeta = V.meta() || {}, reqId = 'change-password-requirements';
    var o = passField('Contraseña actual');
    var n1 = passField('Contraseña nueva', { autocomplete: 'new-password', describedby: reqId, hint: 'Al menos 10 caracteres.' });
    var n2 = passField('Repite la contraseña nueva', { autocomplete: 'new-password', required: false, describedby: 'change-password-match' });
    var matchHint = passwordConfirmation(n1.input, n2, 'change-password-match');
    var newPasswordHints = passwordChecklist(n1.input, accountMeta.display || accountMeta.user || '', reqId);
    root.appendChild(UI.section('Cambiar la contraseña', [h('form', { class: 'auth-form', onsubmit: function (ev) {
      ev.preventDefault();
      var problems = C.passwordProblems(n1.input.value, accountMeta.display || accountMeta.user || '');
      if (problems.length) return msg('bad', problems[0]);
      if (!matchHint.validate()) return;
      var old = o.input.value, nw = n1.input.value;
      work(A.changePassword(old, nw), 'Cambiando…').then(function (r) {
        o.input.value = n1.input.value = n2.input.value = '';
        newPasswordHints.update(); matchHint.reset();
        if (r.remoteChanged) msg('ok', 'La contraseña cambió en este equipo y el servicio confirmó el cambio; las demás sesiones se cerraron.');
        else if (r.remoteTrustBlocked) msg('warn', 'La contraseña cambió solo en este equipo. La dirección del servicio no está aprobada en esta versión; no se envió la contraseña ni se cambió nada en la nube.');
        else if (r.remoteAccountMissing) msg('warn', 'La contraseña cambió solo en este equipo. El servicio está configurado, pero todavía no tiene una cuenta creada.');
        else msg('warn', 'La contraseña cambió solo en este equipo. No hay un servicio conectado; sus datos remotos no se modificaron.');
      }).catch(function (e) { msg('bad', e.message); });
    } }, o.node, n1.node, newPasswordHints.node, n2.node, h('button', { type: 'submit', class: 'btn' }, 'Cambiar contraseña'))]));
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

    root.appendChild(UI.section('Dejar de usar este equipo', [h('p', { class: 'hint' }, 'Este navegador guarda una copia cifrada de tus proyectos y fotos para que la app funcione rápido. Si vas a prestar, devolver o dejar de usar este equipo, bórrala. No se toca nada del Drive de la comunidad: al volver a entrar con tu contraseña, tus proyectos se descargan de nuevo. Lo que no alcanzó a enviarse al Drive se pierde.'),
      UI.btn('Borrar los datos de este equipo', { icon: 'trash', cls: 'ghost danger', onclick: function () { UI.confirmBox('Se borrarán proyectos, fotos y ajustes de ESTE equipo y tendrás que crear o conectar la cuenta otra vez. Lo del Drive no se borra. ¿Seguir?', 'Borrar todo').then(function (ok) { if (ok) A.wipeDevice().then(function () { location.hash = '#/'; location.reload(); }); }); } })]));
    return root;
  } };
})(typeof window !== 'undefined' ? window : globalThis);
