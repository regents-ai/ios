import { config } from 'dotenv';

config();

const { default: app } = await import('./app.js');

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
