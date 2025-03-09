let counter = 0;

/**
 * Return a unique id (within this session only)
 * @returns 
 */
export function uid()
{
    return crypto.randomUUID() as string//
}

/**
 * Return a unique id (within this session only)
 * @returns 
 */
export function uid2()
{
    return counter++;//crypto.randomUUID()//
}