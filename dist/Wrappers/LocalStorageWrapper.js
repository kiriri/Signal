export function local(key, signal) {
    signal.subscribe((s, v) => {
        localStorage.setItem(key, JSON.stringify(v));
    });
    const initial_value = localStorage.getItem(key);
    if (initial_value !== null) {
        if ("set" in signal) {
            signal.set(JSON.parse(initial_value));
        }
    }
    else {
        localStorage.setItem(key, JSON.stringify(signal.get()));
    }
    return signal;
}
//# sourceMappingURL=LocalStorageWrapper.js.map