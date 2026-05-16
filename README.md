# Comando Electoral AMVA 2026

Herramienta de coordinación electoral para los 10 municipios del Área Metropolitana del Valle de Aburrá (AMVA). Permite gestionar coordinadores, pregoneros, testigos electorales y recursos de movilidad por puesto de votación, con sincronización en tiempo real entre múltiples usuarios.

## Stack

- **Frontend**: HTML/CSS/JS vanilla — sin frameworks, sin bundler.
- **Base de datos**: Firebase Firestore (proyecto `comando-electoral-amva`).
- **Autenticación**: Firebase Anonymous Auth (permite aplicar reglas de seguridad en Firestore sin crear cuentas de usuario en Firebase).
- **Hosting**: Vercel — cualquier push a `main` redeploya automáticamente.

## Desarrollo local

```bash
# Opción 1 — Python (ya instalado en macOS/Linux)
python3 -m http.server 8080

# Opción 2 — Node
npx serve .
```

Abre `http://localhost:8080` en el navegador. La app se conecta al mismo Firestore de producción.

## Deploy

Automático vía Vercel. Cada push a `main` en GitHub redeploya la app en <https://coordinacion-electoral.vercel.app>.

No hay build step ni configuración adicional; Vercel sirve archivos estáticos directamente.

## Configuración de Firebase (pasos manuales — solo una vez)

### 1. Habilitar Anonymous Auth

1. Ir a [Firebase Console](https://console.firebase.google.com/) → proyecto `comando-electoral-amva`.
2. Menú: **Authentication** → **Sign-in method**.
3. Buscar **Anonymous** → habilitarlo → **Guardar**.

Sin este paso, la app muestra el error "Habilita Anonymous Auth..." al cargar.

### 2. Publicar las reglas de Firestore

1. En Firebase Console → **Firestore Database** → pestaña **Rules**.
2. Reemplazar el contenido con el archivo `firestore.rules` de este repositorio:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /estado/{doc} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. Hacer clic en **Publish**.

Estas reglas bloquean el acceso externo directo a Firestore. Solo clientes que hayan completado el flujo de Anonymous Auth (es decir, la app web) pueden leer y escribir.

## Cómo agregar o cambiar un usuario coordinador

Editar `js/auth.js`, sección `const USERS`:

```js
const USERS = {
  'coordinador1': { pass: 'Cord1.2026*', nombre: 'Coordinador 1' },
  'coordinador2': { pass: 'Cord2.2026*', nombre: 'Coordinador 2' },
  // agregar aquí:
  'coordinador4': { pass: 'NuevaPass.2026*', nombre: 'Coordinador 4' }
};
```

Hacer commit y push a `main`. Vercel redeploya en segundos.

## Cómo restaurar datos por defecto

Si el documento de Firestore queda en un estado corrupto:

1. Ir a Firebase Console → **Firestore Database** → colección `estado`.
2. Abrir el documento `amva26v2`.
3. Eliminar el documento.

Al siguiente login, la app lo recreará con los datos base definidos en `js/data.js`.

## Estructura de archivos

```
/index.html              → HTML limpio + referencias a CSS y JS
/css/styles.css          → Todos los estilos (extraídos del monolito original)
/js/data.js              → RAW, PREG_BASE, MOV_PRELOAD, AMVA, TAGS (datos estáticos)
/js/firebase-init.js     → firebaseConfig, inicialización de db y auth
/js/auth.js              → USERS hardcoded, doLogin, doLogout, Anonymous Auth
/js/sync.js              → onSnapshot listener, writeField, writeFields, deepMerge
/js/app.js               → Render, handlers, exports PDF/Excel, startApp
/firestore.rules         → Reglas de seguridad para Firestore
/README.md               → Este archivo
```

## Limitaciones conocidas y notas de seguridad

- **Contraseñas en código fuente**: los `USERS` con sus contraseñas están en `js/auth.js`, visible en el repositorio. Cualquiera con acceso al repo (o que descargue los estáticos) puede ver las credenciales. Esto es intencional por simplicidad operativa.
- **Barrera real de seguridad**: las reglas de Firestore + Anonymous Auth bloquean el acceso externo directo a la base de datos. Un atacante que descargue los archivos JS pero no corra la app no puede autenticarse anónimamente y será rechazado por Firestore.
- **Sincronización**: la app usa `onSnapshot()` para recibir cambios en tiempo real. Si dos usuarios editan el **mismo campo** simultáneamente, el último en hacer blur gana (comportamiento esperado con `update()` por campo).
- **Sin internet**: Firestore persiste offline automáticamente. Los cambios se guardan localmente y sincronizan al recuperar la conexión.
