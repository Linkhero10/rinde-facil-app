# Plantillas para lo que depende de personas

## A. Validación con Mónica (o quien conozca el proceso real)

Objetivo: comprobar con alguien que rinde de verdad que los pasos, los avisos y las reglas de Rinde Fácil coinciden con la práctica. Se responde por escrito, con **veredicto** por fila (no narrativa).

Instrucciones: 1) abrir la app con datos de prueba; 2) recorrer cada punto; 3) marcar **Coincide / Difiere / No sé** y, si difiere, escribir qué dice la práctica y de dónde lo sabe (documento, correo, persona).

| N.º | Qué se revisa | Dónde está en la app | Veredicto | Qué dice la práctica / fuente |
|---|---|---|---|---|
| 1 | Orden de las 6 fases | Mi ruta | | |
| 2 | Los 3 pasos del primer desembolso (firmar convenio, abrir cuenta, recibir el 30 %) | Fase 1 | | |
| 3 | Plazo del PEA: 90 días corridos + 30 de prórroga desde el primer desembolso | Calculadora de plazos | | |
| 4 | Aclarar observaciones: 10 días hábiles | Observaciones de CORFO | | |
| 5 | Cotizaciones: sobre $10.000.000 netos, 2 cotizaciones | Gastos y rendición | | |
| 6 | Tope de administración: $3.000.000 mensuales | Presupuesto | | |
| 7 | Pago en efectivo → Anexo 3 | Gastos y rendición | | |
| 8 | Viáticos → Anexo 4 y certificado | Anexo 4 | | |
| 9 | Gasto compartido → memoria de cálculo (Anexo 5) | Anexo 5 | | |
| 10 | Inmuebles y derechos de agua: 2 tasaciones y libres de gravámenes | Gastos y rendición | | |
| 11 | Lista «Qué necesitará tu proyecto» y qué hacer si algo no está en el PEA | Qué necesitará tu proyecto | | |
| 12 | Actas de mesas de trabajo: asistencia mínima de 2 representantes por parte | Actas | | |
| 13 | Redacción: siempre «Organismo Colaborador», nunca el nombre de una organización | Toda la app | | |

Firma de quien valida: ____________________  Fecha: ________

## B. Lote nuevo de documentos para el extractor de comprobantes

El extractor de comprobantes se ajustó con 12 documentos (71 de 72 campos leídos bien). Eso **no demuestra** que funcione con otros formatos. Para medirlo de verdad hace falta un lote nuevo que **no se use para ajustar** el extractor.

Qué reunir (mínimo 40; ideal 100):

* Boletas y facturas electrónicas de proveedores distintos (ferretería, supermercado, transporte, alojamiento, combustible, honorarios).
* Fotos tomadas con celulares distintos, en papel térmico, arrugadas, con poca luz, giradas y a distancia.
* Un 20 % de documentos «difíciles»: voucher de tarjeta, boleta manuscrita, comprobante de transferencia.

Cómo prepararlos:

1. Quitar o tapar datos de personas naturales que no correspondan (o pedir su autorización).
2. Nombrar `NNN-tipo.jpg`.
3. Llenar la verdad terreno a mano: `NNN`, tipo, folio, fecha, RUT emisor, neto, IVA, total, proveedor.
4. Guardar la verdad terreno en un archivo aparte que **el extractor no vea** (`test/private/`).

Cómo se mide: se corre el extractor y se cuenta, por campo, cuántos coinciden exactamente; se reportan aciertos, errores y «vacíos» por separado, y se leen a mano los errores. Solo con ese resultado se decide si se escala.
