export function Flatten() {
    return (target: any) => {
      // Runtime no-op - transformation happens at build time
      return target;
    };
  }