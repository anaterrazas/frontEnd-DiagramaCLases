
import client from '@/core/http/client';

export async function getAll() {
  const response = await client.get('/user-salas');
  return response.data;
}

export async function del(id: number,) {
  const response = await client.delete(`/user-salas/${id}`);
  return response.data;
}

export async function share(id: number,) {
  const response = await client.post(`/user-salas/compartir/${id}`);
  return response.data;
}