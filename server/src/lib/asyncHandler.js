// Express 4'te async route handler'lar throw ederse process crash eder.
// Bu wrapper hatayı yakalayıp Express error middleware'ine yönlendirir.
//
// Kullanım:
//   router.post('/foo', asyncHandler(async (req, res) => { ... }))

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
