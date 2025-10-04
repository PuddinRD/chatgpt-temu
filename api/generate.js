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

// Carga el SDK oficial de Google Gemini
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

// ==========================================
//     MIDDLEWARE PARA PERMISOS (CORS)
// ==========================================

// Tu función allowCors existente, no necesita cambios.
const allowCors = (fn) => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Cambiar '*' por tu dominio en producción si es necesario.
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  return await fn(req, res);
};

// ==========================================
//       LÓGICA PRINCIPAL DEL ENDPOINT
// ==========================================

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'El campo "prompt" es requerido.' });
  }

  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error('Error: GOOGLE_API_KEY no está configurada.');
    return res.status(500).json({ error: 'Error de configuración del servidor.' });
  }

  // --- NUEVA LÓGICA CON EL SDK DE GOOGLE GEMINI ---

  try {
    // Inicializa el cliente del SDK con tu API Key
    const genAI = new GoogleGenerativeAI(apiKey);

    // Obtiene el modelo Gemini Flash
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

    // Configuración opcional para controlar la generación (temperature, maxOutputTokens, etc.)
    // Puedes ajustar estos valores según necesites
    const generationConfig = {
      temperature: 0.9, // Más cercano a 0 para respuestas más deterministas, más alto para más creativas
      topK: 1,
      topP: 1,
      maxOutputTokens: 2048,
    };

    // Configuración opcional para el manejo de seguridad
    // Esto es muy recomendado para aplicaciones en producción
    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
    ];

    // Envía el prompt al modelo
    const result = await model.generateContent({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig,
      safetySettings,
    });

    // Procesa la respuesta del modelo
    // El SDK ya nos da un objeto más directo para obtener el texto
    const response = result.response;
    const text = response.text(); // Usa el método .text() para obtener el contenido principal

    if (text) {
      // Si todo sale bien, enviamos la respuesta al frontend
      return res.status(200).json({
        candidates: [{
          content: {
            parts: [{ text: text }]
          }
        }]
        // Mantenemos la estructura original de tu respuesta para no romper el frontend
        // Pero internamente, estamos usando el SDK más eficientemente.
      });
    } else {
      console.warn('La respuesta de Gemini no contiene texto legible.');
      return res.status(500).json({ error: 'No se recibió una respuesta textual válida del modelo.' });
    }

  } catch (error) {
    console.error('Error al llamar a la API de Google Gemini con SDK:', error);

    let errorMessage = 'Error interno al procesar la consulta con la IA.';
    let statusCode = 500;

    // El SDK puede lanzar diferentes tipos de errores.
    // Intentamos extraer un mensaje de error útil.
    if (error.response && error.response.data) {
      errorMessage = error.response.data.error?.message || errorMessage;
      statusCode = error.response.status || statusCode;
    } else if (error.message) {
      errorMessage = `Error de Gemini: ${error.message}`;
      // Puedes intentar parsear el mensaje de error para códigos de estado específicos si es necesario
      if (error.message.includes('API key not valid')) {
          statusCode = 401; // Unauthorized
          errorMessage = 'La clave API no es válida o no tiene permisos. Verifique su GOOGLE_API_KEY.';
      } else if (error.message.includes('Blocked reason')) {
          statusCode = 403; // Forbidden
          errorMessage = `Contenido bloqueado por las políticas de seguridad de la IA: ${error.message}`;
      }
    }

    return res.status(statusCode).json({ error: errorMessage });
  }
};

// ==========================================
//        EXPORTACIÓN DE LA FUNCIÓN
// ==========================================

module.exports = allowCors(handler);