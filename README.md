# NexoSaldo

*Cada proyecto, bajo control.* — gestión financiera por evento para emprendedores.

> Nombre provisional: no se ha verificado la disponibilidad de marca, dominios ni tiendas.

## Estado (v0.1.0 — Etapas 1 y 2 + núcleo)

| Componente | Estado |
|---|---|
| Capa financiera (`nexosaldo/finance`) | ✅ Implementada y probada |
| Esquema PostgreSQL con RLS, triggers y auditoría (`db/migrations`) | ✅ Implementado y probado contra PostgreSQL 16 |
| PDF de cotización para el cliente (`nexosaldo/pdf`) | ✅ Implementado y probado |
| Textos/enlaces para WhatsApp y correo | ✅ Generados (el envío real depende del dispositivo) |
| Aplicación web completa (11 secciones, PDF, CSV, respaldo JSON) | ✅ `web/` → `site/` |
| Publicación en GitHub Pages (modo local o Supabase con login y RLS) | ✅ Ver [docs/GITHUB.md](docs/GITHUB.md) |
| Pruebas automáticas en GitHub Actions | ✅ `.github/workflows/ci.yml` |
| Exportación .xlsx nativa, adjuntos en Supabase Storage | ⏳ Pendiente (CSV disponible) |

## Publicar en GitHub

Sigue [docs/GITHUB.md](docs/GITHUB.md): crear el repositorio, subir estos archivos, activar
GitHub Pages y, si quieres cuentas y base de datos en la nube, configurar Supabase.

## Requisitos

- Python 3.11+
- PostgreSQL 15+ (o un proyecto Supabase)
- Paquetes: `reportlab`, `pdfplumber` (pruebas). Próximas etapas: `flask`, `psycopg[binary]`, `openpyxl`.

## Base de datos

```bash
createdb nexosaldo
psql -d nexosaldo -f db/migrations/0001_init.sql
```

La aplicación debe conectarse con un usuario que tenga el rol `nexosaldo_app`
(sin superusuario, para que RLS aplique) y fijar por transacción:

```sql
SET LOCAL app.user_id = '<uuid del usuario autenticado>';
```

En Supabase: reemplazar el cuerpo de `app.current_user_id()` por `SELECT auth.uid()`.

## Pruebas

```bash
python -m unittest discover -s tests -v
# Pruebas de base de datos (opcionales, requieren PostgreSQL):
NEXOSALDO_TEST_PG="-h localhost -p 5432 -U postgres" python -m unittest tests.test_database -v
```

## Estructura

```
nexosaldo/finance/   money, budget, quotes, income, results, compare
nexosaldo/pdf/       brand (logo, colores), quote_pdf (PDF + textos de envío)
db/migrations/       0001_init.sql
docs/ARQUITECTURA.md diagnóstico, modelo de datos, fórmulas, seguridad, plan
tests/               test_finance, test_pdf, test_database
samples/             cotizacion_ejemplo.pdf (datos de demostración)
```

## Prototipo web (Artifact en claude.ai)

`web/` contiene la aplicación navegable: `web/src/*` se ensambla con `web/build.sh` en
`web/dist/nexosaldo.html`. Usa la misma lógica financiera (portada a JS con centavos enteros),
genera PDF reales con pdf-lib y guarda los datos en la base del artifact.

```bash
node --test web/tests/finance.test.js     # paridad de fórmulas con Python
node web/tests/pdf.test.js /tmp && python3 web/tests/check_pdf.py /tmp
node web/tests/ui.e2e.js /tmp             # recorrido completo en Chromium
```
