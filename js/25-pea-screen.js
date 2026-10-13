/* Rinde Fácil — «Subir el PEA»: lee el Word del PEA (RF.pea, js/24-pea-extract.js) o su PDF escaneado, muestra lo que leyó
 * para revisarlo y corregirlo, y lo aplica al proyecto sin borrar nada de lo que ya existe.
 * La parte pura (RF.pea.applyToState: modelo del PEA -> estado nuevo) no toca el DOM ni los servicios; se prueba en test/pea_apply.test.mjs.
 * Los campos de cada proyecto siguen el esquema de js/02-store.js (newProject) y de js/32-tools-plan.js (budgetLines, gantt). */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var P = RF.pea = RF.pea || {};
  var TOOLS = RF.tools = RF.tools || {};

  var ADMIN = 'Gastos de administración';
  var DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  var CUENTAS = ['rrhh', 'operacion', 'inversion', 'administracion'];
  /* cuentas que se presupuestan en un proyecto; la de administración va al proyecto automático */
  var CUENTAS_OPC = [{ id: 'rrhh', name: 'Recursos humanos' }, { id: 'operacion', name: 'Gastos operacionales' }, { id: 'inversion', name: 'Gastos de inversión' }];
  var PDF_MIME = 'application/pdf';
  var OCR_AVISO = 'Este PEA se leyó por OCR (PDF escaneado): revisa cada dato contra el documento antes de aplicar. El presupuesto y la carta Gantt no se leen de un escaneado: escríbelos en la sección de cada proyecto, o sube el Word del PEA.';
  var LOCAL_MSG = 'Guardado solo en este equipo; conecta el servicio para copiarlo al Drive.';
  var seq = 0;

  /* ---------- lógica pura ---------- */

  function nrm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function clean(v) { var s = String(v == null ? '' : v).trim(); return s === '' ? null : s; }
  function copia(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function sameName(a, b) { var x = nrm(a); return x !== '' && x === nrm(b); }
  function findNamed(list, name) {
    for (var i = 0; i < (list || []).length; i++) if (sameName(list[i].name, name)) return list[i];
    return null;
  }
  function newId(prefix, opts) {
    if (opts && typeof opts.uid === 'function') return opts.uid(prefix);
    if (RF.util && RF.util.uid) return RF.util.uid(prefix);
    seq++;
    return prefix + '-' + seq.toString(36) + '-' + Date.now().toString(36);
  }
  /* etiqueta de cuenta del PEA («RECURSOS HUMANOS», «GASTOS DE INVERSIÓN»…) -> clave de la app */
  function cuentaKey(label) {
    if (CUENTAS.indexOf(label) >= 0) return label; /* ya es la clave de la app */
    var n = nrm(label).toUpperCase();
    if (/RECURSOS HUMANOS/.test(n)) return 'rrhh';
    if (/OPERACION/.test(n)) return 'operacion';
    if (/INVERSION/.test(n)) return 'inversion';
    if (/ADMINISTRACION/.test(n)) return 'administracion';
    return null;
  }
  /* el proyecto de administración (automático) y los proyectos que se aplican */
  function esAdmin(p) { return !!p && sameName(p.name, ADMIN); }
  /* el de administración solo se aplica si trae un monto mayor que cero: no se crea uno vacío ni en $0 */
  function aplicables(m) {
    return (m.projects || []).filter(function (p) { return p && !(esAdmin(p) && !((p.budgetApproved || {}).administracion > 0)); });
  }
  /* nombre con el que se crea el proyecto; si el PEA no trae nombre no se inventa uno */
  P.nameOf = function (mp) { return clean(mp && mp.name) || ('Proyecto ' + ((mp && mp.code) || 'sin nombre')); };
  function lineSig(cuenta, item, monto, fuente) { return [cuenta, nrm(item), monto, fuente].join('|'); }
  /* mismo esquema que RF.store newProject (js/02-store.js); migrate() completa los campos que falten al recargar */
  function makeProject(name, opts) {
    return {
      id: newId('p', opts), name: name, code: '', convenio: 'corfo-2026-09', tipo: 'inversion',
      start: '', end: '', desembolso1: '', periodoInicio: '', periodoFin: '',
      budgetApproved: { rrhh: 0, operacion: 0, inversion: 0, administracion: 0 },
      done: {}, gantt: { stages: [] }, budgetLines: [], expenses: [], f29: [], obras: [], forms: {}, pea: { general: {}, proyecto: {} },
      observations: [], cotizaciones: [], reitem: { rows: [], motivo: '' }, notes: '',
      needs: {}, needsSet: false, peaAprobado: false, peaAprobadoAt: '', needsPea: null, needsAdded: [], needsCustom: [], show: {}, createdAt: new Date().toISOString()
    };
  }

  /* RUT que se prellena en la pantalla: el del PEA (vacío si el PEA no lo trae) */
  P.rutInicial = function (model) { return clean(model && model.community && model.community.rut) || ''; };

  /* Devuelve un estado NUEVO (no toca el de entrada). Reglas:
   * - nunca borra comunidades, proyectos, líneas ni actividades existentes;
   * - un proyecto con el mismo nombre se reutiliza (no se duplica); sus datos del PEA reemplazan los campos del PEA
   *   solo cuando el PEA trae un valor (un campo vacío en el PEA no borra lo que hubiera);
   * - las líneas de presupuesto y las actividades que ya existen (mismo contenido) no se repiten;
   * - «Gastos de administración» se crea o actualiza una sola vez, con auto: true, y solo si trae un monto mayor que cero;
   * - opts.rut y opts.legalRep, si vienen, reemplazan los del modelo (opts.rut undefined = usar el del modelo). */
  P.applyToState = function (state, model, opts) {
    opts = opts || {};
    var s = JSON.parse(JSON.stringify(state || {}));
    var m = model || {};
    var mc = m.community || {};

    s.community = s.community || {};
    var c = s.community;
    c.name = clean(mc.name) || c.name || '';
    var rut = opts.rut !== undefined ? clean(opts.rut) : clean(mc.rut);
    c.rut = rut || c.rut || '';
    var legal = opts.legalRep !== undefined ? clean(opts.legalRep) : clean(mc.legalRep);
    c.legalRep = legal || c.legalRep || '';
    var direccion = clean(mc.address);
    if (direccion) c.address = direccion; else if (c.address === undefined) c.address = '';
    var organismo = clean(mc.oc);
    if (organismo) c.oc = organismo; else if (c.oc === undefined) c.oc = '';

    /* contacto y datos del PEA: se copian del modelo (o de opts.contacto); nunca borran lo que ya hay */
    var contacto = opts.contacto || mc.contacto;
    if (contacto) c.contacto = copia(contacto);
    var mail = clean(((contacto && contacto.correos) || [])[0]);
    var fono = clean(((contacto && contacto.telefonos) || [])[0]);
    if (!clean(c.email) && mail) c.email = mail;
    if (!clean(c.phone) && fono) c.phone = fono;
    if (Array.isArray(mc.peaDatos)) c.peaDatos = copia(mc.peaDatos);
    else if (!Array.isArray(c.peaDatos)) c.peaDatos = [];
    ['fechaEntrega', 'asambleaValidacion', 'asambleaTexto', 'apoyo'].forEach(function (k) {
      if (mc[k] != null) c[k] = mc[k];
      else if (c[k] === undefined) c[k] = null;
    });

    s.projects = Array.isArray(s.projects) ? s.projects : [];
    (m.projects || []).forEach(function (mp) {
      if (!mp || esAdmin(mp)) return;
      var p = findNamed(s.projects, P.nameOf(mp));
      if (!p) { p = makeProject(P.nameOf(mp), opts); s.projects.push(p); }

      if (clean(mp.code)) p.code = clean(mp.code);
      if (mp.start) p.start = mp.start;
      if (mp.end) p.end = mp.end;
      if (mp.source) p.peaSource = mp.source;
      if (Array.isArray(mp.peaDatos)) p.peaDatos = copia(mp.peaDatos);
      if (mp.fuentes) p.fuentes = copia(mp.fuentes);

      p.budgetApproved = Object.assign({ rrhh: 0, operacion: 0, inversion: 0, administracion: 0 }, p.budgetApproved || {});
      CUENTAS.forEach(function (k) {
        var v = mp.budgetApproved && mp.budgetApproved[k];
        if (v != null) p.budgetApproved[k] = v;
      });

      p.budgetLines = Array.isArray(p.budgetLines) ? p.budgetLines : [];
      var sigs = {};
      p.budgetLines.forEach(function (l) { sigs[lineSig(l.cuenta, l.item, l.monto, l.fuente)] = true; });
      (mp.budgetLines || []).forEach(function (l) {
        var cu = cuentaKey(l.cuenta);
        if (!cu || l.monto == null) return;
        var fuente = /propio|aporte/i.test(String(l.fuente || '')) ? 'propio' : 'corfo';
        var item = clean(l.item) || '(sin nombre)';
        var sig = lineSig(cu, item, l.monto, fuente);
        if (sigs[sig]) return;
        sigs[sig] = true;
        p.budgetLines.push({ id: newId('b', opts), cuenta: cu, item: item, glosa: clean(l.glosa) || '', fuente: fuente, monto: l.monto, actId: '' });
      });

      if (!p.gantt || !Array.isArray(p.gantt.stages)) p.gantt = { stages: [] };
      ((mp.gantt && mp.gantt.stages) || []).forEach(function (ms) {
        var sname = clean(ms.name) || 'Sin etapa';
        var st = findNamed(p.gantt.stages, sname);
        if (!st) { st = { id: newId('s', opts), name: sname, acts: [] }; p.gantt.stages.push(st); }
        if (!Array.isArray(st.acts)) st.acts = [];
        (ms.acts || []).forEach(function (a) {
          var aname = clean(a.name) || '(sin nombre)';
          if (findNamed(st.acts, aname)) return;
          st.acts.push({ id: newId('a', opts), name: aname, start: a.start || '', end: a.end || '', result: clean(a.result) || '' });
        });
      });
    });

    var admin = (m.projects || []).filter(function (x) { return x && esAdmin(x); })[0];
    if (admin) {
      var monto = admin.budgetApproved && admin.budgetApproved.administracion;
      var ap = findNamed(s.projects, ADMIN);
      /* el proyecto automático solo nace con un monto mayor que cero: ninguna comunidad recibe uno vacío por defecto */
      if (!ap && monto > 0) { ap = makeProject(ADMIN, opts); s.projects.push(ap); }
      if (ap) {
        ap.auto = true;
        ap.budgetApproved = Object.assign({ rrhh: 0, operacion: 0, inversion: 0, administracion: 0 }, ap.budgetApproved || {});
        if (monto != null) ap.budgetApproved.administracion = monto;
      }
    }
    return s;
  };

  /* ---------- pantalla ---------- */

  function readBuffer(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('no se pudo leer el archivo')); };
      fr.readAsArrayBuffer(file);
    });
  }
  function msgOf(e) { return (e && e.message) || String(e || 'error desconocido'); }

  /* guarda el Word del PEA en la carpeta de planificación del Drive; devuelve {local:true} si no hay servicio */
  function savePeaDrive(file, projectName) {
    if (!RF.drive || !RF.drive.enabled()) return Promise.resolve({ local: true });
    var mime = /\.pdf$/i.test(file.name) ? PDF_MIME : DOCX_MIME;
    return RF.cloud.blobToBase64(file).then(function (b64) {
      return RF.cloud.post('saveFile', { project: projectName || 'Mi comunidad', category: 'planificacion', fileName: file.name, mimeType: mime, base64: b64 }, 90000);
    }).then(function (r) {
      if (!r || !r.ok) throw new Error(RF.drive.errText(r && r.error));
      return r;
    });
  }

  /* acta de no objeción: Documentos oficiales (categoría oficial, subcarpeta «Actas de no objeción») */
  function saveActaRecord(file, date, projectId) {
    var s = RF.store.get();
    var p = (s.projects || []).filter(function (x) { return x.id === projectId; })[0];
    if (!p) return Promise.reject(new Error('el proyecto ya no existe'));
    var rec = { id: newId('d'), type: 'acta_no_objecion', title: 'Acta de No Objeción', date: date, projectId: p.id, from: 'corfo', peaChange: 'no', changes: {}, note: '', sgpDone: false, appDone: false, createdAt: new Date().toISOString(), fileName: file.name, mime: RF.repo.mimeOf(file.name, file.type), size: file.size, blobId: null };
    rec.blobId = 'rec-' + rec.id;
    return RF.blobs.put(rec.blobId, file).then(function () {
      RF.store.update(function (st2) {
        st2.repo = st2.repo || { docs: [], actas: [] };
        st2.repo.docs = st2.repo.docs || [];
        st2.repo.docs.push(rec);
        var pp = (st2.projects || []).filter(function (x) { return x.id === p.id; })[0];
        if (pp) pp.actaNoObjecion = { date: date, fileName: file.name, docId: rec.id, at: rec.createdAt };
      });
      if (!RF.drive || !RF.drive.enabled()) return { local: true, rec: rec };
      return RF.drive.saveExternal(rec, file).then(function (r) {
        if (RF.repo.attachDriveResult(rec, r)) RF.store.update(function () { }, { silent: true });
        return { local: false, rec: rec, r: r };
      });
    });
  }

  /* Lectura de PDF escaneado por páginas: cada página leída se guarda en IndexedDB (RF.blobs) al terminar. Si la página se recarga,
   * se descarta o se cambia de pantalla, la lectura se reanuda y las páginas ya leídas no se vuelven a pagar. */
  var PEA_EN_CURSO = null; /* la lectura que corre en esta página, para no pagar dos veces lo mismo */
  function trabajoDe(file) { return { id: 'pea|' + file.name + '|' + file.size, nombre: file.name, tamano: file.size }; }
  function claveDePagina(t, n) { return 'pea-pagina|' + t.id + '|' + n; }
  function esFalloDePagina(r) { return !r || (r.ok === false && !/SIN_TEXTO|no devolvió texto/.test(String(r.error || ''))); }
  function guardarPagina(t, n, r) {
    if (!RF.blobs || !RF.blobs.put || !bovedaAbierta()) return;
    RF.blobs.put(claveDePagina(t, n), new Blob([JSON.stringify(r)], { type: 'application/json' })).catch(function () { /* sin espacio: esa página se volverá a leer si se reanuda */ });
  }
  function leerPaginasGuardadas(t, total) {
    var out = {}, pedidas = [];
    if (!RF.blobs || !RF.blobs.get) return Promise.resolve(out);
    var leerUna = function (num) {
      return RF.blobs.get(claveDePagina(t, num)).then(function (b) {
        if (!b || !b.text) return null;
        return b.text().then(function (x) { out[num] = JSON.parse(x); });
      }).catch(function () { /* esa página no estaba guardada o no se pudo leer */ });
    };
    for (var n = 1; n <= total; n++) pedidas.push(leerUna(n));
    return Promise.all(pedidas).then(function () { return out; });
  }
  function guardarMeta(t, total) {
    if (!RF.blobs || !RF.blobs.put || !bovedaAbierta()) return;
    RF.blobs.put('pea-trabajo', new Blob([JSON.stringify({ id: t.id, nombre: t.nombre, tamano: t.tamano, total: total })], { type: 'application/json' })).catch(function () { /* sin espacio */ });
  }
  function borrarTrabajo(t, total) {
    if (!RF.blobs || !RF.blobs.del) return;
    for (var n = 1; n <= total; n++) RF.blobs.del(claveDePagina(t, n));
    RF.blobs.del('pea-trabajo');
  }
  /* con la bóveda cerrada no se guarda nada: lo que llegue después de cerrar la sesión no entra a IndexedDB sin cifrar */
  function bovedaAbierta() { return !!(RF.vault && RF.vault.isOpen && RF.vault.isOpen()); }
  function sesionCerrada() { return new Error('SESION_CERRADA'); }
  /* al terminar una lectura, la pantalla que quedó abierta (si la hay) recibe el resultado sin tener que cambiar de página */
  function avisarLecturaTerminada(detalle) {
    document.dispatchEvent(new CustomEvent('rf-pea-lectura-terminada', { detail: detalle }));
  }

  TOOLS.subirpea = { title: 'Subir el PEA', icon: 'file', desc: 'Sube el Word del PEA: la app lee tu comunidad, tus proyectos, el presupuesto y la Carta Gantt, y los aplica sin borrar nada.', render: function () {
    var U = RF.util, UI = RF.ui, h = U.h;
    var st = { file: null, model: null, leido: null, notice: '', reading: false, stage: '', ocrText: '', fromPdf: false, busy: false, result: null, lectura: null, lecturaUrl: null, paginas: [],
      acta: { file: null, date: '', projectId: '', busy: false, result: null } };

    /* la lectura se guarda en IndexedDB (RF.blobs), aparte del estado de la app: no se pierde al sincronizar y no viaja en las copias de Drive */
    function guardarLectura() {
      if (!st.model || !RF.blobs || !RF.blobs.put || !bovedaAbierta()) return;
      var datos = { model: st.model, leido: st.leido, ocrText: st.ocrText, fromPdf: st.fromPdf, fileName: st.file ? st.file.name : null, guardado: new Date().toISOString() };
      RF.blobs.put('pea-lectura-datos', new Blob([JSON.stringify(datos)], { type: 'application/json' })).catch(function () { /* sin espacio: la lectura queda solo en esta pestaña */ });
      if (st.file) RF.blobs.put('pea-lectura', st.file).catch(function () { /* el archivo no se pudo guardar: se puede volver a elegir */ });
    }
    /* al volver a la pantalla (o recargar) se recupera la última lectura y su archivo, si los hay */
    function recuperarLectura() {
      if (!RF.blobs || !RF.blobs.get) return;
      var datos = null;
      RF.blobs.get('pea-lectura-datos').then(function (b) {
        if (!b || !b.text || st.model || st.reading) return null;
        return b.text().then(function (t) { return JSON.parse(t); }).then(function (d) {
          if (!d || !d.model || st.model || st.reading) return null;
          datos = d;
          st.model = d.model; st.leido = d.leido || copia(d.model);
          st.ocrText = d.ocrText || ''; st.fromPdf = !!d.fromPdf;
          st.notice = 'Recuperamos la lectura de «' + (d.fileName || 'tu PEA') + '» que dejaste antes. Si quieres ver las páginas, vuelve a elegir el archivo.';
          paint();
          return RF.blobs.get('pea-lectura');
        });
      }).then(function (f) {
        if (!f || !datos || !st.model || st.file) return;
        /* con la bóveda abierta el archivo vuelve cifrado y sin nombre: se le pone el que tenía */
        st.file = f.name ? f : new File([f], datos.fileName || 'PEA.pdf', { type: f.type || '' });
        paint();
      }).catch(function () { /* sin lectura guardada o con la bóveda cerrada: se puede volver a elegir el archivo */ });
    }
    /* si una lectura quedó a medias (se cerró la página o se recargó), se ofrece reanudarla: lo ya leído no se vuelve a cobrar */
    function ofrecerContinuar() {
      if (!RF.blobs || !RF.blobs.get) return;
      RF.blobs.get('pea-trabajo').then(function (b) {
        if (!b || !b.text || st.model || st.reading) return null;
        return b.text().then(function (x) { return JSON.parse(x); });
      }).then(function (meta) {
        if (!meta || !meta.id || !meta.total || st.model || st.reading) return null;
        if (PEA_EN_CURSO) { st.notice = 'La lectura de «' + PEA_EN_CURSO.nombre + '» sigue en curso. Vuelve a esta pantalla cuando termine.'; paint(); return null; }
        return leerPaginasGuardadas(meta, meta.total).then(function (guardadas) {
          return RF.blobs.get('pea-lectura').then(function (f) {
            if (!f || st.model || st.reading) return;
            st.trabajo = { nombre: meta.nombre, hechas: Object.keys(guardadas).length, total: meta.total, file: f.name ? f : new File([f], meta.nombre || 'PEA.pdf', { type: f.type || 'application/pdf' }) };
            paint();
          });
        });
      }).catch(function () { /* sin lectura a medias */ });
    }
    function continuarTrabajo() {
      var t = st.trabajo;
      if (!t || !t.file) return;
      st.trabajo = null;
      onPdf(t.file);
    }
    recuperarLectura();
    ofrecerContinuar();
    var body = h('div');

    /* si la lectura sigue en segundo plano al abrir esta pantalla, al terminar se pone al día sola (sin cambiar de página) */
    var conectada = false;
    function alTerminarLectura(ev) {
      if (body.isConnected) conectada = true;
      if (conectada && !body.isConnected) { document.removeEventListener('rf-pea-lectura-terminada', alTerminarLectura); return; }
      var d = ev.detail || {};
      if (!body.isConnected || st.reading || d.corrida === st.pdfRun) return;
      if (d.ok) {
        soltarDescarga();
        st.file = d.file; st.fromPdf = true; st.trabajo = null; st.notice = '';
        st.model = d.model; st.leido = copia(d.model); st.ocrText = d.ocrText || '';
        st.lectura = d.lectura; st.lecturaUrl = URL.createObjectURL(new Blob([JSON.stringify(d.lectura)], { type: 'application/json' }));
        st.paginas = (d.paginas || []).map(function (p) { return { number: p.number, url: URL.createObjectURL(p.blob) }; });
      } else {
        st.file = null; st.model = null; st.leido = null; st.fromPdf = false; st.ocrText = ''; soltarDescarga();
        st.trabajo = d.trabajo; st.notice = d.notice || '';
      }
      paint();
    }
    if (PEA_EN_CURSO) document.addEventListener('rf-pea-lectura-terminada', alTerminarLectura);

    /* libera el enlace de descarga de la lectura técnica (JSON) del PDF anterior */
    function soltarDescarga() {
      if (st.lecturaUrl) URL.revokeObjectURL(st.lecturaUrl);
      (st.paginas || []).forEach(function (p) { URL.revokeObjectURL(p.url); });
      st.lectura = null; st.lecturaUrl = null; st.paginas = [];
    }

    function onFile(file) {
      if (!file) return;
      /* mientras una lectura de PDF corre, elegir otro archivo no toca la pantalla: esa lectura termina y aplica su resultado */
      if (PEA_EN_CURSO) {
        st.notice = PEA_EN_CURSO.id === trabajoDe(file).id ? 'Esa lectura ya está en curso. Espera a que termine.' : 'Hay otra lectura en curso (' + PEA_EN_CURSO.nombre + '). Espera a que termine antes de empezar otra.';
        paint(); return;
      }
      st.file = null; st.model = null; st.leido = null; st.result = null; st.notice = ''; st.ocrText = ''; st.fromPdf = false; st.stage = ''; soltarDescarga();
      if (/\.pdf$/i.test(file.name) || /pdf/i.test(file.type || '')) { onPdf(file); return; }
      if (!/\.docx$/i.test(file.name)) { st.notice = 'Ese archivo no es un Word (.docx) ni un PDF. Sube el Word del PEA o el PDF escaneado.'; paint(); return; }
      st.file = file; st.reading = true; paint();
      readBuffer(file).then(function (buf) { return P.extractFromDocxBytes(buf); }).then(function (model) {
        if (st.file !== file) return;
        st.model = P.normalizarModelo(model);
        st.leido = copia(st.model);
        guardarLectura();
      }).catch(function (e) {
        if (st.file === file) { st.file = null; st.notice = 'No se pudo leer el Word: ' + msgOf(e) + '. Revisa que sea el Word del PEA.'; }
      }).then(function () { st.reading = false; paint(); });
    }

    /* PDF escaneado: cada página se dibuja derecha, se manda al OCR del servicio y el texto se lee por posición (RF.pea.extractFromOcr).
       Si el usuario elige otro archivo mientras esto corre, deja de mandar páginas y no toca la pantalla. */
    function onPdf(file) {
      if (!RF.ocr || !RF.ocr.recognizePage || !RF.pdfPages || !RF.pea.extractFromOcr) { st.notice = 'No está cargada la lectura de PDF en esta versión.'; paint(); return; }
      if (!RF.cloud || !RF.cloud.configured()) { st.notice = 'Para leer un PDF escaneado conecta primero el servicio en la nube (en Ajustes). Mientras tanto puedes subir el Word del PEA.'; paint(); return; }
      var trabajo = trabajoDe(file);
      if (PEA_EN_CURSO) {
        st.notice = PEA_EN_CURSO.id === trabajo.id ? 'Esa lectura ya está en curso. Espera a que termine.' : 'Hay otra lectura en curso (' + PEA_EN_CURSO.nombre + '). Espera a que termine antes de empezar otra.';
        paint(); return;
      }
      if (!bovedaAbierta()) { st.notice = 'La sesión está cerrada. Vuelve a entrar para leer el PDF.'; paint(); return; }
      PEA_EN_CURSO = trabajo;
      var corrida = {}, blobsPagina = [], total = 0, hechas = 0;
      st.file = file; st.pdfRun = corrida; st.reading = true; st.fromPdf = true; st.stage = 'Preparando el PDF…'; st.trabajo = null; st.notice = ''; paint();
      /* el archivo se guarda antes de leer: si la página se cierra a mitad de camino, la lectura se puede reanudar */
      if (RF.blobs && RF.blobs.put) RF.blobs.put('pea-lectura', file).catch(function () { /* sin espacio */ });
      /* vigente: sigue siendo este archivo y esta misma corrida; si el usuario eligió otro, lo de aquí ya no se aplica */
      var vigente = function () { return st.file === file && st.pdfRun === corrida; };
      var say = function (label) { if (vigente()) { st.stage = label; paint(); } };
      /* si la corrida quedó abandonada sin que otra lectura tomara la pantalla (p. ej. se eligió un archivo que no es PDF), solo apaga su indicador */
      var soltarLectura = function () { if (st.file === null && st.pdfRun === corrida) { st.reading = false; st.stage = ''; paint(); } };
      var terminar = function () { if (PEA_EN_CURSO === trabajo) PEA_EN_CURSO = null; };
      readBuffer(file).then(function (buf) {
        return RF.pdfPages.renderPages(buf, function (num, t) { say('Preparando la página ' + num + ' de ' + t + '…'); }, vigente);
      }).then(function (rendered) {
        total = rendered.total;
        blobsPagina = rendered.pages.map(function (p) { return { number: p.number, blob: p.blob }; });
        if (!bovedaAbierta()) throw sesionCerrada();
        guardarMeta(trabajo, total);
        return leerPaginasGuardadas(trabajo, total).then(function (guardadas) {
          var results = [], chain = Promise.resolve();
          rendered.pages.forEach(function (p) {
            chain = chain.then(function () {
              if (guardadas[p.number]) { results.push(guardadas[p.number]); hechas++; return null; }
              if (!bovedaAbierta()) throw sesionCerrada();
              say('Leyendo la página ' + p.number + ' de ' + total + ' con Google…');
              return RF.ocr.recognizePage(p.blob, p.number, function (intento) {
                say('Google no respondió bien con la página ' + p.number + '. Reintentando (intento ' + intento + ' de 3)…');
              }).then(function (r) {
                results.push(r);
                /* si la sesión se cerró mientras Google respondía, esa página no se guarda sin cifrar */
                if (!bovedaAbierta()) throw sesionCerrada();
                /* cada página buena queda guardada al momento: si se corta la lectura, no se vuelve a pagar */
                if (!esFalloDePagina(r)) { hechas++; guardarPagina(trabajo, p.number, r); }
              });
            });
          });
          return chain.then(function () { return RF.pdfPages.aggregate(results, total); });
        });
      }).then(function (res) {
        terminar();
        if (!vigente()) return soltarLectura();
        if (!res || !res.ok) throw new Error(motivoPdf(res));
        st.ocrText = RF.pdfPages.reviewText(res);
        soltarDescarga();
        st.lectura = res;
        st.lecturaUrl = URL.createObjectURL(new Blob([JSON.stringify(res)], { type: 'application/json' }));
        st.paginas = blobsPagina.map(function (p) { return { number: p.number, url: URL.createObjectURL(p.blob) }; });
        st.model = P.normalizarModelo(RF.pea.extractFromOcr(res));
        st.leido = copia(st.model);
        /* sin sesión no se guarda la lectura final: las páginas quedan cifradas y, al volver a entrar, se aplica sin volver a cobrar */
        if (!bovedaAbierta()) throw sesionCerrada();
        guardarLectura();
        borrarTrabajo(trabajo, total);
        st.reading = false; st.stage = ''; st.notice = ''; paint();
        avisarLecturaTerminada({ ok: true, corrida: corrida, model: st.model, ocrText: st.ocrText, file: file, lectura: res, paginas: blobsPagina });
      }).catch(function (e) {
        terminar();
        if (!vigente()) return soltarLectura();
        var pendiente = total ? { nombre: trabajo.nombre, hechas: hechas, total: total, file: file } : null;
        st.file = null; st.model = null; st.leido = null; st.fromPdf = false; st.ocrText = ''; soltarDescarga();
        st.reading = false; st.stage = ''; st.trabajo = pendiente;
        var motivo = e && e.message === 'SESION_CERRADA' ? 'se cerró la sesión durante la lectura' : msgOf(e).replace(/\.$/, '');
        st.notice = 'No se pudo leer el PDF: ' + motivo + '.' + (pendiente && hechas ? ' Lo que ya se leyó queda guardado cifrado: al reintentar no se cobra de nuevo.' : '');
        paint();
        avisarLecturaTerminada({ ok: false, corrida: corrida, trabajo: pendiente, notice: st.notice });
      });
    }

    /* por qué no se aplicó el PDF: las páginas que fallaron, cada una con su motivo */
    function motivoPdf(res) {
      var fallidas = (res && res.failedPages) || [];
      if (fallidas.length) {
        return (fallidas.length === 1 ? 'falta la página ' : 'faltan las páginas ') + fallidas.map(function (f) { return f.number + ' (' + String(f.error).replace(/\.$/, '') + ')'; }).join(', ') + '; vuelve a intentarlo, no se aplicó nada';
      }
      var det = String((res && res.error) || 'OCR_SIN_TEXTO');
      return /SIN_TEXTO/.test(det) ? 'el OCR no encontró texto legible en el PDF' : det;
    }

    function uploadBox() {
      var inp = h('input', { type: 'file', accept: '.docx,.pdf', class: 'sr-only', 'aria-label': 'Elegir el Word o el PDF del PEA' });
      return UI.section('1 · Elige el Word o el PDF del PEA', [
        h('div', { class: 'file-pick' }, inp,
          UI.btn(st.file ? 'Cambiar archivo' : 'Elegir el PEA', { icon: 'file', cls: st.file ? 'ghost' : 'primary', onclick: function () { inp.click(); } }),
          st.file ? h('span', { class: 'file-name' }, st.file.name + ' · ' + Math.max(1, Math.round(st.file.size / 1024)) + ' KB') : h('span', { class: 'hint' }, 'Word (.docx) o PDF escaneado (se lee con el OCR del servicio).')),
        UI.fileDrop(inp, { kind: 'official', label: 'Arrastra aquí el PEA o pulsa para buscarlo', hint: 'Word (.docx) o PDF.', invalidText: 'Ese formato no se puede leer aquí. Sube el PEA en Word (.docx) o PDF.', onFiles: function (files) { onFile(files[0]); } }),
        st.notice ? UI.callout('warn', '', st.notice) : null,
        st.trabajo && !st.reading ? UI.callout('warn', 'Lectura a medias:', ' ' + st.trabajo.nombre + ': ' + st.trabajo.hechas + ' de ' + st.trabajo.total + ' páginas ya están leídas. Continuar no vuelve a cobrar esas páginas.') : null,
        st.trabajo && !st.reading ? UI.btn('Continuar la lectura', { icon: 'check', cls: 'primary', onclick: continuarTrabajo }) : null,
        st.reading ? h('p', { class: 'hint' }, st.stage || 'Leyendo el PEA…') : null
      ]);
    }

    /* campos de una lista (teléfonos, correos): uno por valor y un campo vacío al final para agregar otro */
    function listaEditable(arr, etiqueta, ph) {
      var out = [];
      for (var i = 0; i <= arr.length; i++) out.push(UI.field(i === 0 ? etiqueta : etiqueta + ' ' + (i + 1), arr, i, { ph: i === 0 ? ph : 'Opcional' }));
      return out;
    }

    /* documento a la izquierda: las páginas del PDF escaneado; del Word no hay imagen aquí */
    function visor() {
      var kids;
      if (st.paginas && st.paginas.length) {
        kids = st.paginas.map(function (p) {
          return h('figure', null, h('img', { src: p.url, alt: 'Página ' + p.number + ' del PEA', loading: 'lazy' }), h('figcaption', null, 'Página ' + p.number));
        });
      } else {
        kids = [h('p', { class: 'hint' }, 'Del Word no se muestra una vista aquí. Ábrelo al lado y revisa cada campo de la derecha.')];
      }
      return h('aside', { class: 'pea-doc', 'aria-label': 'Documento del PEA' }, kids);
    }

    /* líneas de presupuesto del proyecto: las mismas columnas que la herramienta Presupuesto */
    function lineasEditor(mp) {
      mp.budgetLines = Array.isArray(mp.budgetLines) ? mp.budgetLines : [];
      var tb = h('tbody');
      mp.budgetLines.forEach(function (l, i) {
        l.cuenta = cuentaKey(l.cuenta) || 'operacion';
        tb.appendChild(h('tr', null,
          h('td', { 'data-label': 'Cuenta' }, UI.bind(l, 'cuenta', { type: 'select', noEmpty: true, options: CUENTAS_OPC, aria: 'Cuenta' })),
          h('td', { 'data-label': 'Ítem' }, UI.bind(l, 'item', { type: 'text', ph: 'Ej: Materiales', aria: 'Ítem' })),
          h('td', { 'data-label': 'Glosa' }, UI.bind(l, 'glosa', { type: 'text', ph: 'Qué es y para qué', max: 200, aria: 'Glosa' })),
          h('td', { 'data-label': 'Fuente' }, UI.bind(l, 'fuente', { type: 'select', noEmpty: true, options: [{ id: 'corfo', name: 'F1 · CORFO' }, { id: 'propio', name: 'F2 · Aporte propio' }], aria: 'Fuente' })),
          h('td', { 'data-label': 'Monto' }, UI.bind(l, 'monto', { type: 'money', aria: 'Monto' })),
          h('td', { class: 'act' }, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quitar línea', title: 'Quitar línea', onclick: function () { mp.budgetLines.splice(i, 1); paint(); } }, UI.icon('trash', 18)))));
      });
      return [
        mp.budgetLines.length ? null : h('p', { class: 'hint' }, 'Aún no hay líneas de presupuesto. Agrega la primera.'),
        h('div', { class: 'table-scroll' }, h('table', { class: 'edit-grid' }, h('thead', null, h('tr', null, ['Cuenta', 'Ítem', 'Glosa (máx. 200)', 'Fuente', 'Monto', ''].map(function (x) { return h('th', null, x); }))), tb)),
        UI.btn('Agregar línea', { icon: 'plus', cls: 'ghost', onclick: function () { mp.budgetLines.push({ id: U.uid('b'), cuenta: 'operacion', item: '', glosa: '', fuente: 'corfo', monto: 0, actId: '' }); paint(); } })
      ];
    }

    /* Carta Gantt del proyecto: etapas y actividades, con las mismas columnas que la herramienta Carta Gantt */
    function ganttEditor(mp) {
      mp.gantt = mp.gantt && Array.isArray(mp.gantt.stages) ? mp.gantt : { stages: [] };
      var out = [];
      mp.gantt.stages.forEach(function (etapa, si) {
        etapa.acts = Array.isArray(etapa.acts) ? etapa.acts : [];
        var tb = h('tbody');
        etapa.acts.forEach(function (a, ai) {
          tb.appendChild(h('tr', null,
            h('td', { 'data-label': 'Actividad' }, UI.bind(a, 'name', { type: 'text', ph: 'Ej: Taller de capacitación', aria: 'Nombre de la actividad' })),
            h('td', { 'data-label': 'Inicio' }, UI.bind(a, 'start', { type: 'date', aria: 'Inicio' })),
            h('td', { 'data-label': 'Término' }, UI.bind(a, 'end', { type: 'date', aria: 'Término' })),
            h('td', { 'data-label': 'Resultado o hito' }, UI.bind(a, 'result', { type: 'text', ph: 'Qué se logra', aria: 'Resultado' })),
            h('td', { class: 'act' }, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quitar actividad', title: 'Quitar actividad', onclick: function () { etapa.acts.splice(ai, 1); paint(); } }, UI.icon('trash', 18)))));
        });
        out.push(h('div', { class: 'stage-card' },
          h('div', { class: 'stage-head' }, h('span', { class: 'stage-n' }, 'Etapa ' + (si + 1)),
            UI.bind(etapa, 'name', { type: 'text', ph: 'Nombre de la etapa', aria: 'Nombre de la etapa' }),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quitar etapa', title: 'Quitar etapa', onclick: function () { mp.gantt.stages.splice(si, 1); paint(); } }, UI.icon('trash', 18))),
          h('div', { class: 'table-scroll' }, h('table', { class: 'edit-grid' }, h('thead', null, h('tr', null, ['Actividad', 'Inicio', 'Término', 'Resultado o hito', ''].map(function (x) { return h('th', null, x); }))), tb)),
          UI.btn('Agregar actividad', { icon: 'plus', cls: 'ghost', onclick: function () { etapa.acts.push({ id: U.uid('a'), name: '', start: '', end: '', result: '' }); paint(); } })));
      });
      out.push(UI.btn('Agregar etapa', { icon: 'plus', cls: 'primary', onclick: function () { mp.gantt.stages.push({ id: U.uid('s'), name: '', acts: [] }); paint(); } }));
      return out;
    }

    /* lo que leyó la app, en campos que se pueden corregir. Todo se escribe en el modelo y se aplica tal como quede aquí. */
    function summaryBox() {
      var m = st.model, mc = m.community = m.community || {}, kids = [];
      var ct = mc.contacto = mc.contacto || { encargado: null, secretaria: null, telefonos: [], correos: [] };
      ct.secretaria = ct.secretaria || { nombre: null, rut: null };
      ct.telefonos = ct.telefonos || []; ct.correos = ct.correos || [];
      mc.aia30 = mc.aia30 || { recibido: null, saldo: null };
      var leido = (st.leido && st.leido.community) || {};
      var noLeido = 'No aparece en el PEA';
      var rutHint = (leido.rut && mc.rut && leido.rut.replace(/\D/g, '') !== String(mc.rut).replace(/\D/g, ''))
        ? 'El PEA dice ' + leido.rut + '; revisa cuál corresponde.'
        : (leido.rut ? 'Viene del PEA; revisa que coincida con el del Acuerdo CORFO.' : 'El PEA no lo trae. Escríbelo: está en el Acuerdo CORFO.');

      kids.push(UI.section('2 · Comunidad', [
        h('p', { class: 'hint' }, 'Revisa lo que leyó la app y corrige lo que esté mal. Lo que el PEA no trae queda vacío: escríbelo si lo necesitas.'),
        h('div', { class: 'form-grid' },
          UI.field('Nombre de la comunidad', mc, 'name', { cls: 'wide', ph: noLeido }),
          UI.field('RUT de la comunidad', mc, 'rut', { type: 'rut', ph: '12.345.678-5', hint: rutHint }),
          UI.field('Representante legal', mc, 'legalRep', { ph: noLeido, hint: 'El PEA no dice quién es el representante legal. Escríbelo solo si lo confirmas; no lo tomes de las firmas.' }),
          UI.field('Dirección', mc, 'address', { cls: 'wide', ph: noLeido }),
          UI.field('Organismo colaborador', mc, 'oc', { ph: noLeido, hint: 'El PEA solo marca las opciones; escribe el nombre si corresponde.' }),
          UI.field('Apoyo para elaborar el PEA', mc, 'apoyo', { ph: noLeido, hint: 'Escribe la opción marcada en el PEA: asesores, organismo u otros.' }))
      ]));

      kids.push(UI.section('Contacto y fechas', [
        h('div', { class: 'form-grid' },
          UI.field('Encargado del convenio', ct, 'encargado', { cls: 'wide', ph: noLeido }),
          UI.field('RUT del encargado', ct.secretaria, 'rut', { type: 'rut', ph: noLeido }),
          listaEditable(ct.telefonos, 'Teléfono', noLeido),
          listaEditable(ct.correos, 'Correo electrónico', noLeido),
          UI.field('Fecha de entrega a CORFO', mc, 'fechaEntrega', { type: 'date' }),
          UI.field('Validación por la Asamblea, como dice el PEA', mc, 'asambleaTexto', { cls: 'wide', ph: noLeido }),
          UI.field('Fecha de la validación por la Asamblea', mc, 'asambleaValidacion', { type: 'date', hint: 'Solo si el PEA trae una fecha.' }))
      ]));

      /* el saldo es lo recibido menos lo que se asigna a los proyectos; si todo está, se muestra la cuenta */
      var del = (m.projects || []).filter(function (p) { return p && !esAdmin(p); });
      var asignado = (del.length && del.every(function (p) { return p.fuentes && p.fuentes.aia30 != null; }))
        ? del.reduce(function (s, p) { return s + p.fuentes.aia30; }, 0) : null;
      var saldoHint = (mc.aia30.recibido != null && asignado != null)
        ? 'Lo recibido menos lo que asignas a los proyectos da ' + U.fmtCLP(mc.aia30.recibido - asignado) + '.'
        : 'Lo que queda del 30 % del AIA después de asignarlo a los proyectos.';
      var descuadre = (mc.aia30.recibido != null && mc.aia30.saldo != null && asignado != null && mc.aia30.recibido - asignado !== mc.aia30.saldo)
        ? UI.callout('warn', 'El saldo no cuadra:', ' lo recibido menos lo asignado a los proyectos da ' + U.fmtCLP(mc.aia30.recibido - asignado) + ', y el saldo dice ' + U.fmtCLP(mc.aia30.saldo) + '. Revisa cuál es el dato correcto.')
        : null;
      kids.push(UI.section('Fondos del 30 % del AIA', [
        h('div', { class: 'form-grid' },
          UI.field('Monto recibido como primera cuota', mc.aia30, 'recibido', { type: 'money', hint: 'Es el 30 % del Aporte Inicial Acumulado.' }),
          UI.field('Saldo del 30 % del AIA', mc.aia30, 'saldo', { type: 'money', hint: saldoHint })),
        descuadre
      ]));

      var projs = (m.projects || []).filter(function (x) { return x && !esAdmin(x); });
      if (!projs.length) kids.push(UI.callout('warn', 'El PEA no trae proyectos.', ' Revisa el Word: la app busca tablas «Nombre del proyecto».'));
      projs.forEach(function (mp, i) {
        mp.budgetApproved = mp.budgetApproved || { rrhh: null, operacion: null, inversion: null, administracion: null };
        mp.fuentes = mp.fuentes || { aia30: null, aia70: null, otras: null };
        kids.push(UI.section('3 · Proyecto ' + (i + 1), [
          h('div', { class: 'form-grid' },
            UI.field('Nombre del proyecto', mp, 'name', { cls: 'wide', ph: noLeido }),
            UI.field('Código', mp, 'code', { ph: 'Sin código: lo asigna CORFO' }),
            UI.field('Inicio', mp, 'start', { type: 'date' }),
            UI.field('Término', mp, 'end', { type: 'date' })),
          h('h4', null, 'Presupuesto por cuenta'),
          h('div', { class: 'form-grid' },
            UI.field('Recursos humanos', mp.budgetApproved, 'rrhh', { type: 'money' }),
            UI.field('Gastos operacionales', mp.budgetApproved, 'operacion', { type: 'money' }),
            UI.field('Gastos de inversión', mp.budgetApproved, 'inversion', { type: 'money' })),
          h('h4', null, 'Fuentes de financiamiento'),
          h('div', { class: 'form-grid' },
            UI.field('Con cargo al 30 % del AIA', mp.fuentes, 'aia30', { type: 'money' }),
            UI.field('Con cargo al 70 % del AIA', mp.fuentes, 'aia70', { type: 'money' }),
            UI.field('Otras fuentes', mp.fuentes, 'otras', { type: 'money' })),
          h('p', { class: 'hint' }, (mp.presupuestoTotal != null ? 'Total declarado en el PEA: ' + U.fmtCLP(mp.presupuestoTotal) + '. ' : '') + 'La administración no se reparte: va al proyecto «' + ADMIN + '».'),
        ].concat(
          [h('h4', null, 'Presupuesto: líneas por cuenta y fuente')], lineasEditor(mp),
          [h('h4', null, 'Carta Gantt: etapas y actividades')], ganttEditor(mp))));
      });

      var adm = (m.projects || []).filter(function (x) { return x && esAdmin(x); })[0];
      if (!adm) {
        adm = { name: ADMIN, code: null, start: null, end: null, budgetApproved: { rrhh: 0, operacion: 0, inversion: 0, administracion: null }, budgetLines: [], gantt: { stages: [] }, peaDatos: [], fuentes: { aia30: null, aia70: null, otras: null }, source: 'manual' };
        m.projects.push(adm);
      }
      kids.push(UI.section('Proyecto automático «' + ADMIN + '»', [
        h('p', { class: 'hint' }, 'Los gastos de administración no se reparten entre proyectos. Se crea o actualiza una sola vez; si lo dejas vacío no se crea.'),
        h('div', { class: 'form-grid' }, UI.field('Monto de gastos de administración', adm.budgetApproved, 'administracion', { type: 'money', ph: noLeido }))
      ]));

      if (st.fromPdf) {
        kids.push(UI.callout('warn', 'PDF escaneado:', ' ' + OCR_AVISO));
        var lecturaKids = [h('summary', null, 'Texto que leyó el OCR'), h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, st.ocrText || '(sin texto)')];
        if (st.lecturaUrl) lecturaKids.push(h('p', { class: 'hint' }, h('a', { href: st.lecturaUrl, download: 'lectura-pea-tecnica.json' }, 'Descargar lectura técnica (JSON)')));
        kids.push(h.apply(null, ['details', { class: 'ocr-raw' }].concat(lecturaKids)));
      }

      /* el aviso del saldo se calcula en vivo arriba; la lista muestra lo que dijo la lectura al inicio, como registro */
      var w = (m.warnings || []).filter(function (x) { return !/El saldo del 30 % del AIA no cuadra/.test(x); });
      kids.push(UI.section('Avisos de la lectura (' + w.length + ')', w.length
        ? [h('p', { class: 'hint' }, 'Así se leyó el PEA al subirlo. Si ya corregiste un campo, el aviso queda como registro: vale lo que hay en los campos.'), h('ul', { class: 'pea-warn' }, w.map(function (x) { return h('li', null, x); }))]
        : [UI.callout('ok', '', 'La lectura no encontró avisos.')]));

      kids.push(UI.section('4 · Aplicar', [
        h('p', { class: 'hint' }, 'No borra nada de lo que ya tienes: actualiza la comunidad y agrega o completa los proyectos sin duplicarlos. Si aplicas el mismo PEA otra vez, no se repite nada.'),
        h('div', { class: 'row-actions' }, UI.btn('Aplicar al proyecto', { icon: 'check', cls: 'primary', disabled: st.busy || !st.file, onclick: apply })),
        st.result ? UI.callout(st.result.kind, '', st.result.text) : null
      ]));
      return h('div', null, kids);
    }

    function apply() {
      var n = aplicables(P.normalizarModelo(st.model)).length;
      if (!st.model || !st.file) return;
      UI.confirmBox('Se actualizará tu comunidad y se aplicarán ' + n + ' proyecto(s) del PEA, incluido «' + ADMIN + '» si trae monto. No se borra nada de lo que ya tienes. ¿Aplicar?', 'Aplicar').then(function (ok) {
        if (ok) doApply();
      });
    }

    function doApply() {
      /* se aplica lo que quedó en pantalla: el modelo corregido, sin el proyecto de administración vacío */
      var m = JSON.parse(JSON.stringify(P.refrescarDatos(P.normalizarModelo(st.model))));
      m.projects = aplicables(m);
      var file = st.file, prevActive = RF.store.get().activeProjectId;
      st.busy = true; st.result = null; paint();
      var names = (m.projects || []).filter(Boolean).map(P.nameOf);
      try {
        names.forEach(function (nm) { if (!findNamed(RF.store.get().projects, nm)) RF.store.addProject(nm); });
        var res = P.applyToState(RF.store.get(), m, {});
        RF.store.update(function (s) {
          s.community = res.community;
          s.projects = res.projects;
          if (prevActive && s.projects.some(function (p) { return p.id === prevActive; })) s.activeProjectId = prevActive;
        });
      } catch (e) {
        st.busy = false; st.result = { kind: 'bad', text: 'No se aplicó el PEA: ' + msgOf(e) + '. Revisa tus proyectos antes de volver a intentarlo.' };
        paint(); return;
      }
      var rec = { id: newId('pea'), fileName: file.name, at: new Date().toISOString(), blobId: null, projects: names, drive: null };
      var blobId = 'pea-' + rec.id;
      RF.blobs.put(blobId, file).then(function () { rec.blobId = blobId; }, function () { rec.blobId = null; })
        .then(function () {
          RF.store.update(function (s) { s.peaImports = (s.peaImports || []).concat([rec]); });
          var pr = RF.store.project();
          return savePeaDrive(file, pr && pr.name).then(function (r) { return { ok: true, r: r }; }, function (e) { return { ok: false, err: e }; });
        })
        .then(function (out) {
          var note, kind = 'ok';
          if (out.ok && out.r.local) note = LOCAL_MSG;
          else if (out.ok) {
            rec.drive = { url: out.r.url || '', folderUrl: out.r.folderUrl || '', at: new Date().toISOString() };
            RF.store.update(function () { }, { silent: true });
            note = 'El Word quedó en la carpeta de Planificación del Drive.';
          } else { kind = 'warn'; note = 'El Word no se pudo copiar al Drive (' + msgOf(out.err) + '); queda guardado en este equipo.'; }
          var adm = (m.projects || []).filter(function (x) { return x && esAdmin(x); })[0];
          st.busy = false;
          st.result = { kind: kind, text: 'PEA aplicado: comunidad actualizada y ' + names.length + ' proyecto(s) listos' + (adm ? ' (con «' + ADMIN + '»)' : '') + '. ' + note + ' Revisa «Mi comunidad y proyectos» y la Carta Gantt.' };
          UI.toast('PEA aplicado.', kind === 'ok' ? 'ok' : 'warn');
          paint();
        });
    }

    function actaBox() {
      var s = RF.store.get(), projs = s.projects || [];
      var inp = h('input', { type: 'file', accept: '.pdf,.docx', class: 'sr-only', 'aria-label': 'Elegir el acta de no objeción' });
      var dateInp = h('input', { type: 'date', value: st.acta.date, 'aria-label': 'Fecha del acta de no objeción' });
      dateInp.addEventListener('input', function () { st.acta.date = dateInp.value; });
      var sel = h('select', { 'aria-label': 'Proyecto al que corresponde' }, projs.map(function (p) { return h('option', { value: p.id }, p.name || 'Proyecto sin nombre'); }));
      sel.value = st.acta.projectId || s.activeProjectId || (projs[0] && projs[0].id) || '';
      sel.addEventListener('change', function () { st.acta.projectId = sel.value; });
      return UI.section('Acta de no objeción (opcional)', [
        h('p', { class: 'hint' }, 'Se registra en Documentos oficiales con la fecha que escribas. Si el servicio está conectado, también va al Drive, en «Documentos oficiales › Actas de no objeción».'),
        h('div', { class: 'file-pick' }, inp,
          UI.btn(st.acta.file ? 'Cambiar archivo' : 'Elegir el acta (PDF o Word)', { icon: 'file', cls: 'ghost', onclick: function () { inp.click(); } }),
          st.acta.file ? h('span', { class: 'file-name' }, st.acta.file.name) : null),
        UI.fileDrop(inp, { kind: 'official', label: 'Arrastra aquí el acta o pulsa para buscarla', hint: 'PDF o Word.', invalidText: 'Formato no compatible. Sube el acta en PDF o Word.', onFiles: function (files) { st.acta.file = files[0]; paint(); } }),
        h('div', { class: 'form-grid' },
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Fecha del acta'), dateInp),
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Proyecto'), sel)),
        h('div', { class: 'row-actions' }, UI.btn('Registrar el acta', { icon: 'check', cls: 'primary', disabled: st.acta.busy, onclick: saveActa })),
        st.acta.result ? UI.callout(st.acta.result.kind, '', st.acta.result.text) : null
      ]);
    }

    function saveActa() {
      var a = st.acta;
      if (!a.file) { a.result = { kind: 'bad', text: 'Elige el archivo del acta (PDF o Word).' }; paint(); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date || '')) { a.result = { kind: 'bad', text: 'Escribe la fecha del acta.' }; paint(); return; }
      var pid = a.projectId || RF.store.get().activeProjectId;
      if (!pid || !(RF.store.get().projects || []).some(function (p) { return p.id === pid; })) { a.result = { kind: 'bad', text: 'Crea o aplica el PEA primero: el acta se anota en un proyecto.' }; paint(); return; }
      a.busy = true; a.result = null; paint();
      saveActaRecord(a.file, a.date, pid).then(function (out) {
        var txt, kind = 'ok';
        if (out.local) txt = 'Acta registrada en Documentos oficiales. ' + LOCAL_MSG;
        else if (out.r.status === 'saved') txt = 'Acta registrada en Documentos oficiales y copiada al Drive (Actas de no objeción).';
        else if (out.r.status === 'queued') { kind = 'warn'; txt = 'Acta registrada; su copia en el Drive quedó pendiente en este equipo (sin conexión).'; }
        else { kind = 'warn'; txt = 'Acta registrada, pero la copia en el Drive quedó incompleta. Revisa la cola antes de darla por terminada.'; }
        a.busy = false; a.file = null; a.result = { kind: kind, text: txt };
        paint();
      }).catch(function (e) {
        a.busy = false; a.result = { kind: 'bad', text: 'No se registró el acta: ' + msgOf(e) + '.' };
        paint();
      });
    }

    function paint() {
      U.clear(body);
      body.appendChild(uploadBox());
      if (st.model) body.appendChild(h('div', { class: 'pea-split' }, visor(), h('div', { class: 'pea-form' }, summaryBox())));
      body.appendChild(actaBox());
    }

    paint();
    return h('div', { class: 'tool-page' }, h('h1', { class: 'tool-title' }, 'Subir el PEA'),
      h('p', { class: 'lead' }, 'Sube el Word del PEA para que la app arme tu comunidad, tus proyectos, el presupuesto y la Carta Gantt. Revisas y corriges todo antes de aplicarlo.'),
      body);
  } };
})(typeof window !== 'undefined' ? window : globalThis);
