# Acuasmart Rural

Prototipo web de una aplicacion movil con IoT para monitorear la calidad del agua y el caudal en estanques piscicolas de pequeña escala en Manizales, Caldas. Este desarrollo hace parte del proyecto de grado de Ingenieria de Sistemas en la Universidad Nacional Abierta y a Distancia (UNAD - ECBTI).

- **Pagina en vivo:** https://yennyclop34.github.io/Acuasmart/
- **Prototipo en Figma:** https://www.figma.com/proto/BkeF7zzD1vX60RYbAy1z2V/Sin-t%C3%ADtulo?node-id=10-2&t=S2SlCjCDw1tggZeP-1

## De que trata el proyecto

En las veredas de Manizales los pequeños piscicultores suelen revisar el agua a ojo y de vez en cuando. El problema es que cuando llueve duro o hay temporada seca, el caudal cambia muy rapido o baja el oxigeno disuelto, y muchas veces uno se da cuenta tarde cuando ya hay mortalidad de peces.

Acuasmart busca solucionar eso conectando un nodo con sensores (ESP32) junto al estanque para medir el agua todo el tiempo y enviar los datos al celular. Como en el campo la señal se cae a cada rato, el sistema guarda las lecturas localmente y las sincroniza apenas vuelve el internet. Aqui esta la version web interactiva para probar como funciona la interfaz sin necesidad de tener el hardware conectado todavia.

## Pantallas que incluye

- **Predio:** formulario inicial para poner los datos del productor, la vereda, escoger si cultiva trucha arcoiris o mojarra, el ID del nodo y aceptar el tratamiento de datos (Ley 1581 de 2012).
- **Monitoreo:** muestra el estado general del estanque y cuatro tarjetas grandes con las lecturas en tiempo real (oxigeno disuelto, temperatura, pH y caudal), ademas de una sugerencia rapida arriba.
- **Historial:** deja ver las graficas de cada variable en las ultimas 24 horas, 7 dias o 30 dias, marcando con una linea punteada el umbral limite.
- **Alertas:** cuando algun parametro se sale de lo normal salta el aviso, explica que paso y da recomendaciones en orden de prioridad. Tambien guarda la lista de alertas anteriores.
- **Asistente preventivo:** revisa el comportamiento de los ultimos 7 dias para sugerir recambios de agua o limpieza de rejillas en la bocatoma, y permite registrar cuando se hace mantenimiento.

## Modo demostracion

Para poder mostrar como reacciona la app en una emergencia, en la pantalla de **Monitoreo** deje un bloque desplegable abajo que dice *Modo demostración* con tres botones:

1. **Simular caída de oxígeno:** hace que el oxigeno baje hasta nivel critico para ver como cambia a rojo y se dispara la alerta.
2. **Simular pérdida de señal:** desconecta la red simulada para comprobar que la app muestra el ultimo dato guardado mientras el nodo sigue acumulando lecturas.
3. **Restablecer valores normales:** vuelve los parametros a su rango normal y marca la alerta como resuelta.

## Archivos del repositorio

El prototipo esta hecho en HTML, CSS y JavaScript puro, sin librerias externas para que sea liviano y cargue rapido en cualquier celular:

```text
Acuasmart/
├── index.html       (estructura de las 5 pantallas)
├── styles.css       (diseño de alto contraste para leer bajo el sol)
├── config.js        (variables y rangos por especie)
├── simulator.js     (simulador de datos del nodo ESP32)
├── app.js           (logica de alertas, graficas y modo sin conexion)
└── README.md
El prototipo no envía datos a ningún servidor. En la versión con participantes reales, el tratamiento de datos debe cumplir la Ley 1581 de 2012 y el Decreto 1377 de 2013, con consentimiento informado y anonimisación de los predios en los informes.

## Autora

Yenny Carolina López López · Asesor: Orlando Gómez Barboza · UNAD, 2026.
