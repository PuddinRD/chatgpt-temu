

// api/generate.js - Este es el archivo del "backend" o servidor.
// Se encarga de recibir la consulta del usuario desde la página web,
// hablar con la API de Google Gemini y devolver la respuesta a la página web.

// ==========================================
//          CONFIGURACIÓN INICIAL
// ==========================================

// Carga la librería 'dotenv'. Esto permite leer variables "secretas" (como la API Key)
// desde un archivo llamado '.env' cuando ejecutas el proyecto en tu computadora local.
// En producción (como en Vercel), estas variables se configuran de otra manera.
require('dotenv').config();

// Carga la librería 'axios'. Axios es una herramienta muy popular para
// hacer peticiones a otras APIs o servidores a través de internet (HTTP requests).
// La usaremos para hablar con la API de Google Gemini.
const axios = require('axios');

// ==========================================
//     MIDDLEWARE PARA PERMISOS (CORS)
// ==========================================

// Esta función 'allowCors' es un "middleware". Un middleware es como un guardia
// que revisa las peticiones antes de que lleguen a la lógica principal.
// Este guardia en particular se encarga de los permisos CORS.
// CORS (Cross-Origin Resource Sharing) es una medida de seguridad de los navegadores
// que impide que una página web (ej. http://localhost:3000) haga peticiones
// directas a un servidor en un dominio diferente (como nuestra API en Vercel).
// Este middleware añade "cabeceras" especiales a la respuesta para decirle al
// navegador: "Está bien, permite que esta página web hable conmigo".
const allowCors = (fn) => async (req, res) => {
  // 'res.setHeader' añade cabeceras a la respuesta que se enviará al navegador.
  res.setHeader('Access-Control-Allow-Credentials', true); // Permite enviar cookies (si las hubiera).
  // 'Access-Control-Allow-Origin': '*' significa "permite peticiones desde CUALQUIER origen/página web".
  // Para mayor seguridad, en producción podrías poner la URL específica de tu frontend.
  // Ejemplo: res.setHeader('Access-Control-Allow-Origin', 'https://mi-app-gemini.vercel.app');
  res.setHeader('Access-Control-Allow-Origin', '*'); // Cambiar '*' por tu dominio en producción si es necesario.
  // 'Access-Control-Allow-Methods': Indica qué métodos HTTP están permitidos (POST para enviar datos, OPTIONS para una comprobación previa).
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  // 'Access-Control-Allow-Headers': Indica qué cabeceras puede enviar el navegador en su petición.
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Los navegadores a veces envían una petición especial 'OPTIONS' antes de la 'POST' real
  // para comprobar los permisos CORS (se llama "preflight request").
  // Si la petición es OPTIONS, simplemente respondemos que todo está OK (código 200) y terminamos.
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return; // No continuamos a la función principal.
  }

  // Si no es OPTIONS, ejecutamos la función principal ('handler') que contiene la lógica de la API.
  // 'await fn(req, res)' llama a la función 'handler' pasándole la petición (req) y la respuesta (res).
  return await fn(req, res);
};

// ==========================================
//       LÓGICA PRINCIPAL DEL ENDPOINT
// ==========================================

// Esta es la función principal ('handler') que se ejecutará cuando alguien haga una petición a '/api/generate'.
// Es 'async' porque usaremos 'await' para esperar la respuesta de la API de Google.
// Recibe 'req' (la petición del navegador) y 'res' (la respuesta que enviaremos de vuelta).
const handler = async (req, res) => {

  // --- 1. Verificar Método HTTP ---
  // Nos aseguramos de que la petición sea de tipo 'POST'.
  // Usamos POST porque el navegador está enviando datos (el prompt) al servidor.
  if (req.method !== 'POST') {
    // Si no es POST, respondemos con un error 405 "Método no permitido".
    res.setHeader('Allow', ['POST']); // Indicamos que solo POST está permitido.
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // --- 2. Obtener el Prompt ---
  // Extraemos el 'prompt' (la consulta del usuario) del cuerpo de la petición.
  // El frontend lo envía dentro de `req.body` en formato JSON.
  // Usamos desestructuración: `const { prompt } = req.body;` es como `const prompt = req.body.prompt;`
  const { prompt } = req.body;

  // Verificamos si el prompt llegó y no está vacío.
  if (!prompt) {
    // Si no hay prompt, respondemos con un error 400 "Petición incorrecta".
    return res.status(400).json({ error: 'El campo "prompt" es requerido.' });
  }

  // --- 3. Obtener la API Key ---
  // Obtenemos la clave secreta de Google (API Key) desde las variables de entorno.
  // `process.env` es un objeto que contiene todas las variables de entorno del sistema.
  // ¡IMPORTANTE! Nunca pongas la API Key directamente en el código.
  const apiKey = process.env.GOOGLE_API_KEY;

  // Verificamos si la API Key existe en las variables de entorno.
  if (!apiKey) {
    // Si no existe, mostramos un error en la consola del servidor (para el desarrollador).
    console.error('Error: GOOGLE_API_KEY no está configurada.');
    // Respondemos al navegador con un error genérico 500 "Error interno del servidor".
    // No damos detalles de la API Key al usuario por seguridad.
    return res.status(500).json({ error: 'Error de configuración del servidor.' });
  }

  // --- 4. Construir la URL de la API de Google ---
  // Creamos la dirección (URL) a la que haremos la petición a Google Gemini.
  // Incluye el modelo específico que queremos usar ('gemini-1.5-flash-latest')
  // y la API Key como parámetro al final (`?key=${apiKey}`).
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

  // --- 5. Llamar a la API de Google Gemini ---
  // Usamos un bloque 'try...catch' para manejar posibles errores durante la llamada a la API.
  try {
    // Realizamos la petición POST a la API de Google usando 'axios'.
    // `await` pausa la ejecución aquí hasta que Google responda.
    const response = await axios.post(
      apiUrl, // La URL que construimos antes.
      { // El segundo argumento es el 'cuerpo' de la petición (los datos que enviamos).
        // La API de Gemini espera los datos en este formato específico:
        contents: [{        // Una lista de contenidos (generalmente uno para chat simple).
          parts: [{ text: prompt }] // Dentro del contenido, una lista de partes (aquí solo el texto del prompt).
        }],
        // Opcional: Puedes añadir configuración extra para controlar cómo genera la respuesta la IA.
        // generationConfig: {
        //   temperature: 0.7, // Controla la "creatividad" (más alto = más creativo/aleatorio).
        //   maxOutputTokens: 2048, // Limita la longitud máxima de la respuesta.
        // }
      },
      { // El tercer argumento son opciones adicionales, como las cabeceras.
        headers: {
          // Le decimos a Google que estamos enviando datos en formato JSON.
          'Content-Type': 'application/json',
        }
      }
    );

    // --- 6. Enviar Respuesta al Frontend ---
    // Si la llamada a Google fue exitosa, Google nos devuelve datos en `response.data`.
    // Enviamos esos mismos datos de vuelta al frontend (navegador) con un estado 200 "OK".
    // El frontend recibirá esto y mostrará la respuesta de la IA al usuario.
    return res.status(200).json(response.data);

  } catch (error) {
    // --- 7. Manejar Errores de la API ---
    // Si algo falló en el bloque 'try' (ej. error de red, API Key inválida, error de Google),
    // el código saltará a este bloque 'catch'.
    // Mostramos un error detallado en la consola del servidor para depuración.
    // `error.response` contiene detalles si el error vino de la respuesta de Google.
    console.error('Error al llamar a la API de Google:', error.response ? error.response.data : error.message);

    // Preparamos un mensaje de error más simple y seguro para enviar al frontend.
    // Obtenemos el código de estado del error de Google (si existe), o usamos 500 por defecto.
    const statusCode = error.response?.status || 500;
    // Obtenemos el mensaje de error de Google (si existe), o usamos un mensaje genérico.
    const errorMessage = error.response?.data?.error?.message || 'Error interno al procesar la consulta con la IA.';

    // Enviamos la respuesta de error (código y mensaje) al frontend.
    return res.status(statusCode).json({ error: errorMessage });
  }
};

// ==========================================
//        EXPORTACIÓN DE LA FUNCIÓN
// ==========================================

// Finalmente, exportamos la función 'handler' pero "envuelta" con el middleware 'allowCors'.
// Esto significa que antes de que se ejecute 'handler', siempre se ejecutará primero 'allowCors'
// para asegurarse de que los permisos CORS estén configurados correctamente.
// Esto es lo que Vercel (o cualquier entorno Node.js serverless) necesita para usar esta función como un endpoint de API.
module.exports = allowCors(handler);
