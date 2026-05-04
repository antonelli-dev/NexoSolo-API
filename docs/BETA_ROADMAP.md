# Beta interna (Android) — roadmap ejecutable

## Estado de implementación (código)

| Bloque | Estado |
|--------|--------|
| PDF factura real (`GET /v1/freelance/invoices/:id/pdf`) | Hecho — PDFKit + `?locale=en\|es` |
| Email con PDF + enlace temporal | Hecho — `POST .../send-email` adjunta PDF; enlace si `API_PUBLIC_URL` |
| Portal: URL firmada + descarga pública | Hecho — `POST /portal/invoices/:id/pdf-link`, `GET /portal/invoice-pdf?t=` |
| Portal: feedback entregas persistido | Hecho — `updateDeliveryFeedback` → Prisma |
| Paywall sin compra (beta) | Hecho — `EXPO_PUBLIC_BETA_NO_PURCHASE=1` en app |
| Variables nuevas | `API_PUBLIC_URL` (opcional en validación), `JWT_CLIENT_SECRET` (ya usado por portal) |

**Contexto acordado:** beta pequeña, **solo Android** como criterio de cierre, **un staging** compartido, ventana orientativa **2–4 semanas**, flujo **cliente → proyecto → factura → cobro** + **Coach IA** + **portal cliente**, **PDF obligatorio** (app + email), portal con PDF por **URL firmada temporal**, **paywall visible sin cobro**, plantillas **ES + EN** extensibles (p. ej. alemán después). Pendiente de decisión: volumen de testers, datos reales vs ficticios.

---

## Issue 1 — PDF real de factura (bloquea casi todo)

**Objetivo:** `GET /v1/freelance/invoices/:id/pdf` devuelve un **PDF válido** (no el mock actual).

**Código hoy**

- `src/freelance/freelance.service.ts` → `invoicePdfBuffer()` (mock `Buffer.from('Mock PDF content')`).
- `src/freelance/freelance.controller.ts` → `@Get('invoices/:id/pdf')` ya expone el stream.

**Tareas**

1. Elegir generador (p. ej. **PDFKit** vs **Puppeteer**; PDFKit suele ser más simple en Nest sin Chromium).
2. Implementar plantilla de factura con datos de `findFirst` + `include` (ya igual que hoy en `invoicePdfBuffer`).
3. **Locales:** soporte **es** y **en** (parámetro `locale` en query opcional o cabecera `Accept-Language`, o campo en perfil/factura más adelante); estructura de strings para añadir `de` sin duplicar layout.
4. Sustituir mock por buffer real; asegurar **nombre de archivo** legible (`invoice-{number}.pdf` si existe número).

**Criterios de aceptación**

- Abrir el PDF en Adobe/Chrome muestra importe, moneda, cliente, proyecto, líneas si existen en modelo.
- Mismo buffer reutilizable para email y enlaces firmados (Issue 2–3).

---

## Issue 2 — Email con PDF adjunto **o** enlace firmado

**Objetivo:** `POST /v1/freelance/invoices/:id/send-email` cumple la beta (**C**: compartir desde app + email con valor añadido).

**Código hoy**

- `src/freelance/freelance.service.ts` → `sendInvoiceEmail()` (Resend, **solo HTML**, sin adjunto ni enlace PDF).
- DTO: `src/freelance/dto/send-invoice-email.dto.ts`.
- Errores ya mapeados en app: `RESEND_NOT_CONFIGURED`, `INVOICE_EMAIL_NO_RECIPIENT`, `RESEND_SEND_FAILED`.

**Tareas**

1. Tras Issue 1, obtener `Buffer` del PDF (misma función que `invoicePdfBuffer`).
2. Resend API: añadir **`attachments`** (base64) **o** cuerpo HTML con **enlace firmado** (Issue 3); recomendación beta: **adjunto + enlace** opcional según tamaño.
3. Plantillas HTML **ES + EN** (asunto + cuerpo) según `locale` acordado (misma regla que PDF).
4. Staging: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` documentados en `.env.example` o README interno.

**Criterios de aceptación**

- Con cliente con email, el tester recibe correo y puede abrir PDF válido.
- Sin API key, respuesta clara (ya existe `RESEND_NOT_CONFIGURED`).

**App (ya cableada)**

- `RizzUpApp/src/services/freelanceApi.ts` → `sendInvoiceEmail`.
- `RizzUpApp/src/screens/InvoiceDetailScreen.tsx` + `useFreelanceMutations` → botón enviar email.

---

## Issue 3 — Portal cliente: PDF por URL firmada temporal

**Objetivo:** el cliente **no** usa JWT freelance; accede con **token de portal** y obtiene un **enlace corto** a un GET público (o semi-público) que sirve el PDF con **expiración** y **revocación** razonable.

**Código hoy**

- `src/client-portal/client-portal.controller.ts` — `GET portal/access/:token`, `GET portal/invoices`, etc. **No hay** endpoint de PDF para el cliente.
- `src/client-portal/client-portal.service.ts` — TODOs en adjuntos/feedback; revisar qué entra en beta mínima.

**Tareas**

1. Diseñar **token de descarga** (JWT dedicado o random en Redis/DB con `invoiceId`, `exp`, `nonce`).
2. Nuevo endpoint, p. ej. `GET /portal/invoices/:invoiceId/pdf-link` con `ClientPortalGuard` que devuelve `{ url, expiresAt }`, **o** redirect 302 a storage firmado (S3/Supabase).
3. Alternativa: un solo `GET /portal/invoice-pdf/:downloadToken` sin UUID de factura en path (menos filtrable).
4. Expiración típica beta: **15–60 min**; invalidar al **logout** del portal si aplica.
5. Documentar CORS y dominio del staging (`FRONTEND_URL` ya usado en magic link en `client-portal.service.ts`).

**Criterios de aceptación**

- Cliente autenticado en portal puede obtener URL, abrir en navegador del móvil y descargar el **mismo** PDF que Issue 1.
- URL caducada → 401/410 coherente.

**App portal**

- `RizzUpApp/src/screens/ClientPortalScreen.tsx` / `clientPortalService` — TODO deep link / secure storage; alinear con este flujo cuando el backend exponga el contrato estable.

---

## Issue 4 — Portal mínimo funcional (datos y feedback)

**Objetivo:** checklist beta **D** sin prometer todo el backlog del servicio.

**Código**

- `src/client-portal/client-portal.service.ts` (TODOs: archivos en entregas, `clientFeedback`, etc.).

**Tareas**

1. Listar qué devuelve hoy `getClientInvoices` / `getClientProject` y qué ve el cliente en `ClientPortalScreen`.
2. Cerrar **MVP**: lista facturas + estado + enlace PDF (Issue 3); entregas **solo lectura** si feedback no está listo.
3. Si feedback es imprescindible: implementar persistencia mínima alineada con Prisma (evitar `[]` / `undefined` permanentes).

**Criterios de aceptación**

- Flujo mágico: enlace → dashboard → facturas → PDF por URL firmada.

---

## Issue 5 — Paywall “visible, sin cobro” (Android beta)

**Objetivo:** pantalla de planes sin compra real (decisión **D**).

**Código**

- `RizzUpApp/src/screens/PaywallScreen.tsx` (RevenueCat: `purchasePackage`, `restorePurchases`, etc.).
- `RizzUpApp/src/lib/revenuecat.ts`.

**Tareas**

1. Flag explícito, p. ej. `EXPO_PUBLIC_BETA_NO_PURCHASE=1` o `extra` en `app.json` / EAS profile **preview**.
2. Si flag: ocultar o deshabilitar CTA de compra y restauración; mostrar copy tipo “Beta — pronto disponible”.
3. Opcional: `usePremiumAccess` devuelve premium en beta para no bloquear features (decisión de producto).

**Criterios de aceptación**

- Tester no puede completar compra accidental en build beta.
- Navegación a Paywall no rompe la app si RevenueCat no está configurado.

---

## Issue 6 — Android build + staging + checklist manual

**Tareas**

1. EAS / Gradle **internal** o APK firmado apuntando a **URL del staging**.
2. Variables: API base, Supabase, claves IA, Resend (staging).
3. **Checklist manual (1 tester):** crear cliente → proyecto → factura → descargar PDF → enviar email → registrar pago → abrir Coach (cada tab) → generar enlace portal → abrir en navegador incógnito → PDF firmado.

**Criterios de aceptación**

- Documento corto “cómo instalar la beta” enlazado desde este repo o Notion interno.

---

## Issue 7 (post-beta o paralelo si sobra tiempo)

- **Quotes PDF:** `freelance.controller.ts` `@Get('quotes/:id/pdf')` + servicio (hay TODO en `freelance.service.ts` para listados de quotes).
- **iOS TestFlight** cuando Android esté cerrado.
- **Traducciones** adicionales de plantillas PDF/email (`de`, …) reutilizando el mismo sistema de `locale` del Issue 1–2.

---

## Dependencias entre issues

```text
Issue 1 (PDF) ──┬──► Issue 2 (email)
                └──► Issue 3 (URL firmada portal)

Issue 4 (portal datos) puede solaparse con Issue 3; Issue 4 primero si la UI del portal está incompleta.

Issue 5 (paywall) e Issue 6 (build) en paralelo.
```

---

## Referencia rápida de endpoints ya existentes

| Método | Ruta | Notas |
|--------|------|--------|
| GET | `/v1/freelance/invoices/:id/pdf` | Auth JWT usuario; hoy mock PDF |
| POST | `/v1/freelance/invoices/:id/send-email` | Body opcional `{ to }`; hoy sin PDF |
| GET | `/portal/access/:token` | Magic link |
| GET | `/portal/invoices` | Con `ClientPortalGuard` |

*(Prefijo global Nest según vuestro `main.ts`; tablas bajo módulo `freelance` + `client-portal`.)*
