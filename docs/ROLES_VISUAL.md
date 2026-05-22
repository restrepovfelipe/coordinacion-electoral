# Roles y Permisos — Coordinación Electoral

## Resumen de roles

| Rol | Código | Alcance geográfico |
|-----|--------|-------------------|
| Super Administrador | `SUPER_ADMIN` | Todo el sistema |
| Coordinador Regional | `REGIONAL_COORDINATOR` | Múltiples municipios / subregión |
| Coordinador Municipal | `MUNICIPAL_COORDINATOR` | Un municipio |
| Coordinador Zonal | `ZONE_COORDINATOR` | Una zona (conjunto de comunas) |
| Coordinador Comunal | `COMUNA_COORDINATOR` | Una comuna |
| Coordinador de Puesto | `PUESTO_COORDINATOR` | Un puesto de votación |

---

## Permisos por recurso

### Matriz de acceso (PERMISSIONS.matrix.ts)

| Rol | Testigos | Abogados | Movilidad | Refrigerios | Comparendos | Usuarios |
|-----|----------|----------|-----------|-------------|-------------|----------|
| SUPER_ADMIN | CRUD | CRUD | CRUD | CRUD | CRUD | CRUD |
| REGIONAL | CRUD | CRUD | CRUD | CRUD | CRUD | CRU (sin Delete) |
| MUNICIPAL | CRUD | CRUD | CRUD | CRUD | CRUD | — |
| ZONE | CRUD | CRUD | CRUD | CRUD | CRUD | — |
| COMUNA | CRUD | CRUD | CRUD | CRUD | CRUD | — |
| PUESTO | RU | R | R | R | R | — |

> **PUESTO_COORDINATOR** puede leer y editar testigos, pero NO puede crear ni eliminar.

---

## Acceso a páginas y botones

| Elemento UI | SUPER | REGIONAL | MUNICIPAL | ZONE | COMUNA | PUESTO |
|-------------|-------|----------|-----------|------|--------|--------|
| Dashboard principal | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Página Testigos (`/testigos.html`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Página Usuarios (`/usuarios.html`) | ✓ | ✓ | — | — | — | — |
| Botón "Eliminar usuario" | ✓ | — | — | — | — | — |
| Botón crear testigo | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Botón eliminar testigo | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Mapa de subregión | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Exportar PDF/Excel | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Widget de perfil (editar propio) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## Gestión de usuarios (SUPER_ADMIN y REGIONAL)

### Crear usuario
- **SUPER_ADMIN** puede crear usuarios con cualquier rol.
- **REGIONAL_COORDINATOR** puede crear usuarios con cualquier rol **excepto** SUPER_ADMIN.
- Al crear un usuario con rol MUNICIPAL/ZONE/COMUNA/PUESTO, el formulario muestra un selector en cascada para asignar el ámbito geográfico correspondiente.

### Editar usuario
- **SUPER_ADMIN** puede editar cualquier usuario.
- **REGIONAL_COORDINATOR** puede editar usuarios que NO sean SUPER_ADMIN, y no puede promover a nadie a SUPER_ADMIN.

### Eliminar usuario
- Solo **SUPER_ADMIN** puede eliminar usuarios (acción permanente, irreversible).
- El botón "Eliminar" solo aparece en la UI para SUPER_ADMIN.

---

## Auto-edición de perfil (todos los roles)

Todos los usuarios autenticados pueden editar su propio perfil desde el widget de perfil (esquina inferior izquierda):
- **Nombre completo** (`displayName`)
- **Teléfono** (`phone`)
- **Contraseña** (`newPassword`, mínimo 8 caracteres)

Endpoint: `PATCH /api/users/me`

---

## Cascada de creación por rol

| Rol asignado | Ámbito requerido | Selector |
|--------------|-----------------|----------|
| SUPER_ADMIN | Ninguno | — |
| REGIONAL_COORDINATOR | Ninguno | — |
| MUNICIPAL_COORDINATOR | Municipio | Dropdown de municipios |
| ZONE_COORDINATOR | Zona | Dropdown de zonas |
| COMUNA_COORDINATOR | Municipio → Comuna | Dropdown municipio, luego comunas |
| PUESTO_COORDINATOR | Municipio → Puesto | Dropdown municipio, luego puestos |

---

## Scope model (UserScope)

Cada usuario puede tener uno o más scopes que delimitan su acceso geográfico:

```
UserScope {
  userId:    Int
  scopeType: SUBREGION | MUNICIPIO | ZONA | COMUNA | PUESTO
  scopeId:   Int  (id del registro correspondiente en DB)
}
```

El backend evalúa scopes mediante CTE SQL recursivo para determinar los puestos accesibles a cada usuario (ver `PermissionsService.accessiblePuestoIds()`).
