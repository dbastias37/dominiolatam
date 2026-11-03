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

## Render Free · despliegue manual

`render.yaml` configura un único Web Service **Free**, llamado **dominiolatam**, con Node 24 y prueba de salud `/healthz`. No crea discos ni bases de datos de pago.

En Render, crea un **Web Service** desde este repositorio y usa:

| Campo | Valor |
| --- | --- |
| Branch | `main` |
| Name | `dominiolatam` |
| Runtime | Node |
| Build Command | `npm ci --ignore-scripts && npm test` |
| Start Command | `npm start` |
| Instance Type | **Free** |
| Health Check Path | `/healthz` |

Variables de entorno:

```text
NODE_ENV=production
DATABASE_PATH=/tmp/dominio.sqlite
PERSISTENCE_MODE=ephemeral
```

Render proporciona `PORT` y `RENDER_EXTERNAL_URL` automáticamente. También puedes usar el Blueprint incluido; revisa que siga mostrando **Free** antes de aplicarlo. Comprueba el estado `Live` y una respuesta 200 en `/healthz`.

La URL solicitada es `https://dominiolatam.onrender.com`; Render confirma su disponibilidad durante la creación.

### Guardado en la edición gratuita

La campaña individual se guarda en el navegador. Las salas admiten hasta 20 humanos y chat, pero **las cuentas, las salas y el chat son temporales**: Render Free elimina los archivos locales al reiniciar, desplegar de nuevo o entrar en reposo. La interfaz lo anuncia antes de crear una cuenta o una sala. La clave de recuperación permite cambiar una contraseña mientras exista la cuenta; no recupera una base borrada.

Para conservar las salas después de esos reinicios hace falta conectar almacenamiento externo duradero y adaptar el servidor a ese proveedor. El repositorio actual usa SQLite local y **no incluye esa integración**. No se aprovisiona PostgreSQL Free de Render: caduca a los 30 días.

El servicio gratuito entra en reposo tras 15 minutos sin tráfico y puede tardar alrededor de un minuto en volver. Render aplica cuotas de horas, transferencia y compilación; comprueba los límites de gasto en Billing si tienes un medio de pago asociado para evitar cargos por excedentes.

## Cuentas y partidas

- La campaña individual funciona sin cuenta y se guarda en ese navegador.
- Para salas se crea un usuario de Dominio. La contraseña se guarda con scrypt; las sesiones usan cookies HttpOnly/Secure en producción y un identificador aleatorio guardado como hash en la base.
- Una clave de recuperación se muestra una sola vez. Recuperar una cuenta rota esa clave y cierra las sesiones anteriores; no se requiere un proveedor de correo.
- Las salas y los mensajes se guardan en SQLite. La identidad se resuelve exclusivamente en el servidor; no se confía en cabeceras de identidad enviadas por el navegador.
- El reloj usa plazos absolutos. Si todos cierran el navegador, al reconectar se aplican los turnos vencidos si la sala sigue disponible; no se duplican acciones.
- La nueva URL tiene su propia base de datos y almacenamiento del navegador. No importa automáticamente cuentas, salas ni campañas de la edición anterior.

## Datos y copias

En un despliegue con almacenamiento duradero, `DATABASE_PATH` debe apuntar a ese almacenamiento. En Free, la ruta temporal no conserva copias tras un reinicio. Las migraciones iniciales son idempotentes y se ejecutan al iniciar. Las copias consistentes se crean con la API de backup de SQLite:

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
