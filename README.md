# DOMINIO
### Last Frontier: Latinoamérica

Juego de estrategia por turnos sobre veinte países latinoamericanos. Campaña individual, diplomacia, industria, combates y calendario satírico. Salas para hasta **20 jugadores humanos**, con IA para los países libres, chat, turnos temporizados y reconexión.

Esta edición funciona en un servidor Node.js independiente. El mapa, las fuentes, las banderas y los modelos están incluidos; no depende del acceso de ChatGPT Sites.

## Ejecutar

Requiere Node.js 24.

```sh
npm ci
npm test
npm start
```

Abre `http://localhost:3000`. El servidor escucha en `0.0.0.0` y respeta `PORT`. La base de datos local se crea en `data/dominio.sqlite`; no se sube al repositorio.

## Render

`render.yaml` prepara un único Web Service llamado **dominiolatam**, con Node 24, prueba de salud `/healthz` y un disco persistente de 1 GB montado en `/var/data`.

1. Conecta este repositorio privado con tu cuenta de Render y selecciona el espacio de trabajo correcto.
2. Revisa el Blueprint y autoriza el costo antes de aplicarlo: instancia mínima Starter (0.5 CPU / 512 MB), USD 7/mes, más disco, USD 0.25/mes. Tarifas base consultadas el 3 de noviembre de 2026; pueden existir impuestos o consumos adicionales.
3. Confirma que el despliegue esté `Live`, `/healthz` responda 200 y una sala sobreviva un reinicio.

El destino deseado es `https://dominiolatam.onrender.com`; Render asigna la URL definitiva según disponibilidad. La configuración usa `RENDER_EXTERNAL_URL`, proporcionada por Render. Para otro proxy establece `APP_ORIGIN=https://tu-dominio` y `NODE_ENV=production`.

**No uses un disco efímero para esta edición multijugador.** El plan gratuito de Render pierde archivos locales al reiniciarse o suspenderse; su PostgreSQL gratuito caduca a los 30 días. El Blueprint requiere autorización del propietario antes de crear recursos de pago. El disco limita este diseño a una instancia, con una breve interrupción durante los despliegues; los datos y el reloj lógico se recuperan después.

## Cuentas y partidas

- La campaña individual funciona sin cuenta y se guarda en ese navegador.
- Para salas se crea un usuario de Dominio. La contraseña se guarda con scrypt; las sesiones usan cookies HttpOnly/Secure en producción y un identificador aleatorio guardado como hash en la base.
- Una clave de recuperación se muestra una sola vez. Recuperar una cuenta rota esa clave y cierra las sesiones anteriores; no se requiere un proveedor de correo.
- Las salas y los mensajes se guardan en SQLite. La identidad se resuelve exclusivamente en el servidor; no se confía en cabeceras de identidad enviadas por el navegador.
- El reloj usa plazos absolutos. Si todos cierran el navegador, al reconectar se aplican los turnos vencidos; no se pausa la campaña ni se duplican acciones.
- La nueva URL tiene su propia base de datos y almacenamiento del navegador. No importa automáticamente cuentas, salas ni campañas de la edición anterior.

## Datos y copias

`DATABASE_PATH` debe apuntar al disco persistente. Las migraciones iniciales son idempotentes y se ejecutan al iniciar. Las copias consistentes se crean con la API de backup de SQLite:

```sh
npm run backup
# O define una ruta de destino explícita:
npm run backup -- /var/data/backups/copia.sqlite
```

Guarda periódicamente copias fuera del servicio. Una copia en el mismo disco no protege ante la eliminación de ese disco. Las copias contienen datos privados de cuentas y salas: no las publiques ni las añadas a Git.

## Estructura

| Ruta | Función |
| --- | --- |
| `public/game/` | Juego, interfaz, fuentes y recursos 3D |
| `server/room-model.mjs` | Reglas autoritativas, turnos y reloj de las salas |
| `server/room-api.mjs` | Acciones idempotentes y control de concurrencia |
| `server/auth.mjs` | Cuentas, sesiones y recuperación |
| `server/database.mjs` | Persistencia SQLite y límites de solicitudes |
| `tests/` | Pruebas de mecánicas, interfaz y servidor |

## Créditos

Se conservan los avisos originales de los recursos en `public/game/assets/vehicles/ATTRIBUTION.txt`, `INTEGRATION.txt` y los archivos de los proveedores. Esta publicación no concede una nueva licencia sobre el código del juego ni reemplaza las licencias de terceros.

## Referencias de despliegue

- https://render.com/pricing
- https://render.com/docs/disks
- https://render.com/docs/free
- https://render.com/docs/blueprint-spec
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
