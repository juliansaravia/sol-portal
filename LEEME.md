# El portal

Las páginas que usa el equipo. HTML y JavaScript, sin compilar: se abre y corre.

## Antes de que sirva

Llenar `config-supabase.js` con la URL del proyecto y la llave *anon*
(Supabase → Project Settings → API). Sin eso el portal arranca en **modo
demostración** con datos congelados de julio, y lo avisa en amarillo.

## Las páginas

| Archivo | Para quién |
|---|---|
| `index.html` | portada · elige a qué perfil entrar |
| `admin.html` | gerencia · cartera, mora, comisiones, conciliación |
| `vendedor.html` | vendedores · sus lotes, contratos y comisiones |
| `cliente.html` | el cliente ve su estado de cuenta |
| `comprar.html` | mapa público de lotes disponibles |

## De dónde salen los datos

`datos-remotos.js` los trae de Supabase y llena el objeto `DB` que ya usaba el
portal. **El filtrado no lo hace el navegador**: las políticas de la base
deciden qué filas llegan, así que un vendedor recibe sus contratos y no los del
compañero. Esconder botones no es seguridad; esto sí.

## Los archivos `data-*.js`

Son la foto de julio y **no se suben al repositorio** (ver `.gitignore`):
traen nombres, teléfonos y montos de clientes reales.

Todavía quedan porque las pantallas de calendario de cobranza leen `CALENDARIO`
directo de ahí. Migrar esas pantallas a Supabase es lo que falta para poder
borrarlos.

`data-contactos.js` ya salió: 120 clientes con teléfono, correo y ocupación, y
no lo usaba nadie. Está en `_archivo/datos-julio/`.

## Modo consulta

Mientras `ajuste.modo_consulta` esté en `true`, el portal no escribe nada y sale
una franja abajo diciéndolo. El interruptor vive en la base, no aquí, para que
no se le pueda dar la vuelta desde el navegador:

```sql
update ajuste set valor='false' where clave='modo_consulta';
```
