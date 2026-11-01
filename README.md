# Inmo · Limpieza — demostración

Miniweb estática, diseñada primero para móvil, para revisar la experiencia de
registro de jornadas, gastos con justificantes y solicitudes de tiempo adicional.
No tiene dependencias de ejecución ni requiere un proceso de compilación.

Vista pública: https://jaimemart.github.io/inmo-limpieza/

Repositorio público de la demo: https://github.com/jaimemart/inmo-limpieza

## Alcance de esta versión

- Una pantalla para la trabajadora: vivienda, check-in/check-out y dos botones
  para gastos y tiempo extra. Desplegable con Arzobispo e Hípica.
- Cada fichaje conserva el instante del primer toque, sin confirmación adicional.
  Solo puede haber una jornada abierta. La vivienda queda fijada hasta la salida.
- Fecha de hoy y resumen de las cuatro últimas visitas de la vivienda elegida.
  Cada visita muestra fecha, entrada y salida; las abiertas indican «En curso».
- Histórico accesible a la trabajadora desde `./#historico`, con filtros por
  vivienda y mes, inicialmente el mes corriente. Fechas en Europe/Madrid,
  también en los cambios de mes y las visitas que terminan al día siguiente.
- Gastos con importe, motivo y ticket obligatorio de hasta 2 MB (foto o PDF).
- Tiempo extra entre 1 y 240 minutos, con motivo. Fecha y vivienda automáticas.
- Vista del propietario separada en `./#gestion`; registros en `./#actividad`.
  No hay navegación de gestión en la pantalla de la trabajadora.
- Revisión del ticket, aprobación o rechazo y CSV de control. Los importes son
  solicitudes para verificar; nunca se importan a la contabilidad ni a `Gastos`.
  Se conserva `accounting: false` incluso después de la aprobación.
- Persistencia local y opción para restablecer la demo.

**No es un sistema de fichaje real.** No comprueba el wifi, no identifica a la
trabajadora, no usa la hora de un servidor y no sincroniza datos con
Inmomanagement. La vista de gestión es pública en esta demostración. Los datos
y tickets se guardan únicamente en el almacenamiento de este navegador. No
introducir información ni documentos reales. Borrar el almacenamiento del
navegador elimina las pruebas.

Los errores de almacenamiento se muestran al usuario; no se presenta como
guardado un registro que no se ha podido conservar. El espacio total para
tickets depende de la cuota del navegador. No hay analítica, fuentes externas,
servicios de pago, llamadas a APIs ni seguimiento de ubicación.

## Desarrollo local

Desde esta carpeta:

```bash
python3 -m http.server 8097 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:8097/`. Usar HTTP, no abrir `index.html` como archivo,
porque los scripts son módulos ES.

Desde la raíz del proyecto Inmomanagement, las pruebas de las reglas del modelo
se ejecutan con `node --test tests/cleaning/*.test.mjs`.

Un enlace puede preseleccionar una vivienda:
`./?casa=arzobispo` o `./?casa=hipica`. Si hay una jornada abierta,
se conserva su vivienda hasta registrar la salida. Estos enlaces sirven para
probar el comportamiento que tendrá un QR; no acreditan presencia.

## Publicación de la vista

Publicar **solo los archivos de esta carpeta** en un repositorio público
dedicado de GitHub Pages. No copiar el repositorio de Inmomanagement, su
historial, credenciales, direcciones completas, configuración de red ni documentos.

Configurar Pages para publicar desde `main` y la raíz `/`. Todos los recursos
son relativos y funcionan tanto en un dominio raíz como bajo la ruta de un
repositorio. `.nojekyll` evita el procesamiento de Jekyll. Esta demo no activa
ningún plan de pago.

## Para la versión real

Mantener la miniweb pública y el panel de Inmomanagement en local. Incorporar
un servicio independiente gratuito que valide y almacene las operaciones.

1. Autenticación de la trabajadora y del propietario con permisos separados.
   La vista de gestión pública actual es únicamente una demostración.
2. Validación de cada fichaje en el servidor: vivienda autorizada, conexión de
   origen, fecha/hora del servidor, jornada abierta y protección ante reintentos
   o envíos duplicados. El cliente no debe decidir que una red es válida.
3. Configuración de red privada en el servidor, nunca en este sitio público.
   Verificar IPv4, IPv6, posibles IP dinámicas y CGNAT antes de elegir el método.
   No aceptar cambios de IP enviados por la trabajadora como configuración.
4. Persistencia remota de jornadas, solicitudes, decisiones y justificantes.
   Las correcciones deben conservar el registro original y el motivo del cambio.
   Al adjuntar un ticket, guardar el documento y su referencia junto al motivo,
   importe, vivienda y autora para que el propietario pueda verlo en su equipo.
5. Consulta autenticada desde Inmomanagement, sin necesitar que el ordenador
   esté encendido para fichar. Los tickets y sus importes son control interno;
   no deben convertirse en apuntes contables, ni siquiera al aprobar su revisión.
6. Sustituir el adaptador local de esta demo. Actualizar `connect-src 'none'`
   en la política CSP solo con el origen concreto del servicio necesario.

La cuenta de Cloudflare debe estar autenticada antes de poder crear la base de
datos o desplegar el servicio. La demo publicada no usa una base de datos
compartida, y el histórico tampoco debe presentarse como almacenamiento remoto.

Con DIGI hay que revisar CG-NAT: su conexión estándar utiliza IP dinámicas
compartidas. Registrar una IP una vez no identifica de forma exclusiva una casa.
El modelo de router se puede consultar en Inicio de Mi DIGI; la prueba de la
conexión requiere acceder una vez desde el wifi de cada vivienda. Mantener el
requisito de no contratar cuotas o servicios adicionales sin petición expresa.

### Datos de cada vivienda que se necesitarán después

- Identificador y nombre visible del inmueble.
- Operadora y modelo del router.
- Nombre del wifi, para mostrar las instrucciones de conexión. No hace falta
  publicar ni incorporar la contraseña del wifi en el QR de esta web.
- Con acceso autorizado al router, comprobar si tiene IP pública propia,
  si cambia, si hay CGNAT, y si utiliza IPv6.
- Si soporta actualización dinámica de la dirección y se puede configurar.

El nombre del wifi por sí solo no permite validarlo desde una web. No contratar
una IP fija ni otros servicios de pago sin revisar primero las alternativas.
