// src/services/salaService.ts
import client from '@/core/http/client';

// authService.ts
export async function getAll() {
  const response = await client.get('/salas');
  return response.data;
}

export async function create(data: { title: string, descripcion: string }) {
  const response = await client.post('/salas', data);
  return response.data;
}
export async function update(data: { title: string, descripcion: string }, id: number,) {
  const response = await client.put(`/salas/${id}`, data);
  return response.data;
}
export async function del(id: number,) {
  const response = await client.delete(`/salas/${id}`);
  return response.data;
}
