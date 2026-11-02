import api from './api';

export async function descargarComprobante(venta) {
  const response = await api.get('/ventas/' + venta.id + '/comprobante', { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'nova-salud-' + venta.numero + '.pdf';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
