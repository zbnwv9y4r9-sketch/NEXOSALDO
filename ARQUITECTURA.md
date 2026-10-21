# NexoSaldo — Diagnóstico (Etapa 1) y Arquitectura (Etapa 2)

## 1. Diagnóstico

| Punto | Estado |
|---|---|
| Repositorio GitHub | **No accesible**: la sesión no tiene cuenta de GitHub vinculada ni repositorio configurado. |
| Carpetas locales | Ninguna carpeta del equipo del usuario conectada. |
| Código existente | No se encontró. Se inició un proyecto nuevo, sin sobrescribir nada. |
| Red del entorno | Sin acceso a npm ni PyPI. Sólo herramientas preinstaladas. |
| Herramientas disponibles | Python 3.13 (`decimal`), Flask 3, Jinja2, ReportLab 5, openpyxl, pdfplumber, PostgreSQL 16. |

**Si ya existe un repositorio**, debe reconciliarse antes de seguir: la capa financiera
(`nexosaldo/finance`) y el esquema SQL son independientes del framework web y pueden
trasladarse.

## 2. Decisión de arquitectura

| Capa | Elección | Motivo |
|---|---|---|
| Lógica financiera | Paquete Python `nexosaldo.finance` con `Decimal` | Precisión exacta, una sola fuente de fórmulas, pruebas unitarias. |
| Base de datos | PostgreSQL (compatible con Supabase) | Relacional, RLS para aislar empresas, triggers para reglas contables. |
| Backend / web | Flask + Jinja2 (render en servidor) + JS mínimo | Disponible sin dependencias externas; funciona en Safari iOS sin build. |
| PDF | ReportLab (PDF real, multipágina) | Generación en servidor, idéntica en todos los dispositivos. |
| Excel / CSV | openpyxl / `csv` | Exportaciones reales. |
| Autenticación | Sesión segura en servidor con hash Werkzeug, o Supabase Auth | Ver §5. |

Alternativa equivalente: frontend TypeScript (Next.js) + Supabase. El esquema SQL ya
está preparado para Supabase (sustituir `app.current_user_id()` por `auth.uid()`).

## 3. Modelo de datos (resumen)

```
companies ─┬─ memberships ── app_users
           ├─ categories, payment_methods, tax_rates, clients
           ├─ events ─┬─ budget_lines ── budget_revisions (historial con motivo)
           │          ├─ expenses ─┬─ expense_payments (salidas de dinero)
           │          │            └─ expense_allocations (gasto general → eventos)
           │          ├─ quotes ── quote_versions ─┬─ quote_lines (costos privados)
           │          │                            └─ quote_shares (generado/preparado/enviado)
           │          └─ sales ─┬─ invoices (vinculadas, no crean ingreso)
           │                    └─ receipts (cobros, parciales, idempotentes)
           ├─ savings_goals ── savings_movements (aporte/retiro, confirmados)
           ├─ shareholders ── distribution_lines (% congelado) ── shareholder_payments
           ├─ distributions (propuesta → aprobada; inmutable)
           └─ audit_log (automático por trigger)
```

Conceptos que nunca se mezclan: presupuesto · gasto reconocido · pago · cotización ·
venta aceptada · ingreso reconocido · factura · cobro · ahorro · utilidad · distribución ·
pago a accionista. Cada uno vive en su propia tabla.

## 4. Fórmulas (implementadas en `nexosaldo/finance`)

| Fórmula | Módulo |
|---|---|
| Saldo = Presupuesto − Gastos; Ejecución % ; Variación y Variación % (None si base 0) | `budget.py` |
| Recargo: `costo × (1 + r/100)` · Margen: `costo / (1 − m/100)`, m < 100 · Manual conservado | `quotes.py` |
| Descuento antes de impuestos; impuestos sobre base gravada; impuestos ≠ ingreso | `quotes.py` |
| Venta única por versión aceptada; facturado ≤ total; cobros parciales idempotentes | `income.py` |
| Utilidad operativa; utilidad disponible; ahorro como reserva (no gasto) | `results.py` |
| Distribución con % vigentes = 100 %, sin repartos negativos ni superiores a lo disponible | `results.py` |
| Variación entre períodos; "Sin base de comparación"; rankings; eventos nuevos/no repetidos | `compare.py` |

**Redondeo:** `Decimal` en todo el cálculo, `ROUND_HALF_UP` a 2 decimales al persistir o
mostrar. Los residuos de centavo al repartir se asignan a la parte de mayor peso, de modo
que la suma siempre cuadra con el original.

## 5. Seguridad

- **RLS forzado** en todas las tablas de negocio: cada consulta se filtra por las empresas
  del usuario (`memberships`). Rol `lector` sólo lee.
- **FKs compuestas `(id, company_id)`**: imposible enlazar un gasto a un evento de otra
  empresa aunque se conozca su UUID.
- **Sin borrados físicos** de registros financieros; se anulan con motivo.
- **Auditoría automática** de cambios (`audit_log`), no editable por la aplicación.
- La aplicación se conecta con un rol sin privilegios (`nexosaldo_app`); los secretos van
  en variables de entorno, nunca en el repositorio.

## 6. Plan de etapas siguientes

3. Interfaz: aplicación Flask (login, navegación lateral / barra inferior en móvil,
   dashboard con datos reales, estado vacío).
4. Eventos, presupuestos y gastos (CRUD sobre el esquema, anulaciones, adjuntos privados).
5–6. Editor de cotizaciones con cálculo en vivo, versiones, PDF y compartir
   (Web Share API con archivo en iOS; `wa.me` y `mailto:` como alternativa honesta).
7–9. Cobros, ahorro, accionistas, comparativos, reportes PDF/Excel/CSV.
10–12. Endurecimiento, pruebas end-to-end con Playwright (Safari/WebKit) y documentación de despliegue.
