SA Investment - Scan-to-email integracija

Sadržaj:
- index.html: postojeća aplikacija + treća opcija "Skenirane fakture"
- api/scanned-invoices.js: IMAP -> AI -> scan_queue
- package.json: server dependencies
- supabase_scan_queue.sql: nova izolovana queue tabela
- VERCEL_ENV_SETUP.txt: nazivi server-side varijabli

Tok:
Canon -> mailbox -> /api/scanned-invoices -> OpenAI PDF/image analiza -> scan_queue -> Pregledaj -> postojeći editor -> postojeći saveInvoice -> označi scan obrađenim.

Postojeće invoices/suppliers/invoice_items funkcije nisu zamijenjene.
