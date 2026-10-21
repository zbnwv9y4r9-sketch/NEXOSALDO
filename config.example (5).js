// Configuración de NexoSaldo para GitHub Pages.
// - Déjalo así para usar el MODO LOCAL (datos solo en el navegador de cada dispositivo).
// - Para usar cuentas y base de datos en la nube, crea un proyecto en Supabase,
//   ejecuta supabase/schema.sql y copia aquí la URL y la clave "anon public"
//   (Supabase → Project Settings → API). La clave anon es pública por diseño:
//   la seguridad la aplica la base de datos (Row Level Security).
//   Nunca pongas aquí la clave "service_role".
window.NEXOSALDO_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  companyName: "Mi empresa",
};
