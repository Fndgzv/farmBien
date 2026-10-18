import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClienteService } from './cliente.service';

describe('ClienteService: listado por período', () => {
  let servicio: ClienteService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(ClienteService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('envía fechas, zona horaria, filtros y orden al backend', () => {
    servicio.listar({ q: 'Ana', telefono: '5512', page: 2, limit: 10,
      fechaIni: '2026-10-01', fechaFin: '2026-10-17', sortBy: 'totalMonederoCliente', sortDir: 'desc'
    }).subscribe();
    const req = http.expectOne(request => request.url.endsWith('/clientes'));
    expect(req.request.method).toBe('GET');
    for (const [key, value] of Object.entries({ q: 'Ana', telefono: '5512', page: '2', limit: '10',
      fechaIni: '2026-10-01', fechaFin: '2026-10-17', sortBy: 'totalMonederoCliente', sortDir: 'desc',
      tz: String(new Date().getTimezoneOffset())
    })) {
      expect(req.request.params.get(key)).withContext(key).toBe(value);
    }
    req.flush({ rows: [], paginacion: { total: 0, page: 2, limit: 10 } });
  });
});
