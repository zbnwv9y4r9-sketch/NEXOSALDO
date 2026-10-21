# Publicar NexoSaldo con GitHub

Esta guía deja NexoSaldo funcionando en una dirección propia, por ejemplo
`https://TU-USUARIO.github.io/nexosaldo/`, que se abre en la computadora y en el iPhone.

Tienes dos formas de guardar los datos:

| | **Modo local** (sin configurar nada) | **Modo nube** (con Supabase) |
|---|---|---|
| Dónde se guardan los datos | Solo en el navegador de cada dispositivo | En una base de datos PostgreSQL |
| Inicio de sesión | No | Sí, con correo y contraseña |
| Varios dispositivos o equipo | No (usa respaldos JSON para pasar datos) | Sí, con roles propietario / editor / lector |
| Qué necesitas | Solo GitHub | GitHub + una cuenta de Supabase |

Puedes empezar en modo local y pasar al modo nube después: descarga un respaldo en
Configuración y restáuralo una vez que actives Supabase.

---

## Paso 1 · Crear el repositorio

1. Entra a [github.com](https://github.com) e inicia sesión (o crea una cuenta).
2. Pulsa **New repository**.
3. Nombre: `nexosaldo`. Déjalo **Public** si usas el plan gratuito.
   Publicar con GitHub Pages desde un repositorio privado requiere un plan de pago de GitHub.
   Aunque el repositorio sea público, tus datos no están en el código: se guardan en
   el navegador (modo local) o en Supabase con acceso protegido (modo nube).
4. No marques «Add a README» (el proyecto ya trae uno). Pulsa **Create repository**.

## Paso 2 · Subir los archivos

**Opción A: que Claude lo suba por ti.** En claude.ai, abre *Conectores*, vincula tu
cuenta de GitHub con acceso al repositorio `nexosaldo` y dime el nombre (`usuario/nexosaldo`).

**Opción B: desde el navegador.**
1. Descomprime `nexosaldo.zip` en tu computadora.
2. En la página del repositorio vacío pulsa **uploading an existing file**.
3. Arrastra **el contenido** de la carpeta `nexosaldo` (no la carpeta en sí). Incluye la
   carpeta oculta `.github`: en macOS pulsa `Cmd + Shift + .` en Finder para verla.
   Si el navegador no la sube, créala después con *Add file → Create new file* usando las rutas
   `.github/workflows/pages.yml` y `.github/workflows/ci.yml` y pega su contenido.
4. Pulsa **Commit changes**.

**Opción C: con Git en la terminal.**
```bash
cd nexosaldo
git init && git add . && git commit -m "NexoSaldo"
git remote add origin https://github.com/TU-USUARIO/nexosaldo.git
git branch -M main
git push -u origin main
```

## Paso 3 · Activar GitHub Pages

1. En el repositorio: **Settings → Pages**.
2. En *Build and deployment → Source* elige **GitHub Actions**.
3. Ve a la pestaña **Actions**. Si el flujo «Publicar en GitHub Pages» no ha corrido,
   ábrelo y pulsa **Run workflow**.
4. Cuando termine (marca verde), tu app estará en `https://TU-USUARIO.github.io/nexosaldo/`.

El flujo «Pruebas» se ejecuta en cada cambio y comprueba las fórmulas, el PDF, la base de
datos y los recorridos de usuario. Si alguna falla, aparece una marca roja en *Actions*.

## Paso 4 (opcional) · Activar el modo nube con Supabase

1. Crea una cuenta en [supabase.com](https://supabase.com) y un proyecto nuevo
   (elige la región más cercana y guarda la contraseña de la base de datos).
2. Abre **SQL Editor → New query**, pega todo el contenido de `supabase/schema.sql` y pulsa **Run**.
   Debe terminar sin errores; puedes ejecutarlo de nuevo sin problema.
3. Abre **Authentication → URL Configuration**:
   - *Site URL*: `https://TU-USUARIO.github.io/nexosaldo/`
   - *Redirect URLs*: agrega la misma dirección.
4. Abre **Project Settings → API** y copia:
   - *Project URL*
   - la clave **anon public**. **Nunca** uses la clave `service_role` en la app.
5. En GitHub: **Settings → Secrets and variables → Actions → pestaña Variables → New repository variable** y crea:
   - `SUPABASE_URL` = la Project URL
   - `SUPABASE_ANON_KEY` = la clave anon public
   - `NEXOSALDO_COMPANY_NAME` = el nombre de tu empresa (opcional)
6. En **Actions**, vuelve a ejecutar «Publicar en GitHub Pages».

Al abrir la app verás la pantalla de acceso. Pulsa **Crear cuenta**: la primera persona que
entra queda como **propietario** de una empresa nueva. Supabase envía un correo de
confirmación (puedes desactivarlo en *Authentication → Providers → Email*).

Para sumar a tu equipo, cada persona crea su cuenta y después tú la agregas desde
**Configuración → Cuenta y equipo** como *editor* o *lector*.

**Qué protege la base de datos (aunque alguien manipule la página):**
- cada usuario solo ve los datos de su empresa;
- el rol *lector* no puede escribir;
- los registros financieros no se pueden borrar, solo anular desde la app;
- cada cambio queda en una tabla de auditoría (`nexosaldo_audit`).

## Paso 5 · Instalarla en el iPhone

1. Abre la dirección de tu app en **Safari**.
2. Pulsa **Compartir → Añadir a pantalla de inicio**.
3. Se abrirá a pantalla completa con el icono de NexoSaldo.

En el iPhone, el botón **Descargar PDF** abre la hoja de compartir del sistema, desde donde
envías la cotización por WhatsApp, Mail o la guardas en Archivos.

## Mantenimiento

- **Respaldos:** en Configuración, «Descargar respaldo» guarda todos los registros en un JSON.
  Hazlo con frecuencia en modo local.
- **Cambiar la app:** el código está en `web/src/`. `sh web/build.sh` regenera `site/`
  (GitHub Pages) y `web/dist/nexosaldo.html` (versión para Claude). El flujo de Pages
  recompila automáticamente en cada cambio en `main`.
- **Copias de seguridad en Supabase:** revisa las opciones de respaldo de tu plan en el panel de Supabase.

## Archivos relevantes

| Ruta | Qué es |
|---|---|
| `site/` | La app lista para GitHub Pages (generada) |
| `site/config.js` | Configuración local; vacía = modo local |
| `web/src/` | Código fuente de la app |
| `web/standalone/host.js` | Conexión con el navegador o con Supabase |
| `supabase/schema.sql` | Tablas y reglas de seguridad para Supabase |
| `db/migrations/0001_init.sql` | Modelo relacional completo para la versión comercial |
| `.github/workflows/` | Pruebas automáticas y publicación |
