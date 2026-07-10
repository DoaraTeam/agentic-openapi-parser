export interface IAiAdapter<TTool = unknown, TReturnType = TTool[]> {
  getTools(): TReturnType;
}
