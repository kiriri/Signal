// import { BufferedSubscribable } from "../_Signal2/Sinks/BufferedSubscribable";

import { createOrderTree, OrderItem, OrderTree } from "../_Signal2/Collections/OrderTree";


// Mock BufferedSubscribable for testing
class TestEventEmitter<T> //implements BufferedSubscribable<T> 
{
    events: T[] = [];

    emit(event: T): this
    {
        this.events.push(event);
        return this;
    }

    getLastEvent(): T | undefined
    {
        return this.events[this.events.length - 1];
    }

    clearEvents(): void
    {
        this.events = [];
    }

    countEvents(predicate: (event: T) => boolean): number
    {
        return this.events.filter(predicate).length;
    }
}

// Test utility functions
function assertEqual<T>(actual: T, expected: T, message: string): void
{
    if (actual !== expected)
    {
        console.error(`FAILED: ${message}`);
        console.error(`  Expected: ${expected}`);
        console.error(`  Actual:   ${actual}`);
        throw new Error(`Assertion failed: ${message}`);
    }
    console.log(`PASSED: ${message}`);
}

function assertArrayEqual<T>(actual: T[], expected: T[], message: string): void
{
    if (actual.length !== expected.length)
    {
        console.error(`FAILED: ${message} - Arrays have different lengths`);
        console.error(`  Expected length: ${expected.length}`);
        console.error(`  Actual length:   ${actual.length}`);
        throw new Error(`Assertion failed: ${message}`);
    }

    for (let i = 0; i < actual.length; i++)
    {
        if (actual[i] !== expected[i])
        {
            console.error(`FAILED: ${message} - Arrays differ at index ${i}`);
            console.error(`  Expected: ${expected[i]}`);
            console.error(`  Actual:   ${actual[i]}`);
            throw new Error(`Assertion failed: ${message}`);
        }
    }
    console.log(`PASSED: ${message}`);
}

function assertTreeStructure<T>(tree: OrderTree<T>, expectedValues: T[], message: string): void 
{
    const actualValues: T[] = Array.from(tree).map(item => item.value);
    assertArrayEqual(actualValues, expectedValues, `${message} - Tree structure check`);

    // Check linked list connections
    let item = tree.first;
    let index = 0;
    while (item)
    {
        if (index < expectedValues.length)
        {
            assertEqual(item.value, expectedValues[index], `${message} - Item ${index} value check`);

            // Check next/prev pointers
            if (index > 0)
            {
                assertEqual(item.prev !== null, true, `${message} - Item ${index} should have prev`);
                if (item.prev)
                {
                    assertEqual(item.prev.value, expectedValues[index - 1], `${message} - Item ${index} prev check`);
                }
            } else
            {
                assertEqual(item.prev, null, `${message} - First item should not have prev`);
            }

            if (index < expectedValues.length - 1)
            {
                assertEqual(item.next !== null, true, `${message} - Item ${index} should have next`);
                if (item.next)
                {
                    assertEqual(item.next.value, expectedValues[index + 1], `${message} - Item ${index} next check`);
                }
            } else
            {
                assertEqual(item.next, null, `${message} - Last item should not have next`);
            }
        }

        item = item.next;
        index++;
    }

    // Check first and last pointers
    if (expectedValues.length > 0)
    {
        assertEqual(tree.first?.value, expectedValues[0], `${message} - First pointer check`);
        assertEqual(tree.last?.value, expectedValues[expectedValues.length - 1], `${message} - Last pointer check`);
    } else
    {
        assertEqual(tree.first, undefined, `${message} - First pointer should be undefined for empty tree`);
        assertEqual(tree.last, undefined, `${message} - Last pointer should be undefined for empty tree`);
    }
}

// Test cases
function runBasicOperationsTest(): void
{
    console.log("\n=== Testing Basic Operations ===");

    const emitter = new TestEventEmitter<{ event: "add" | "delete" | "move", value: OrderItem<number> }>();
    const tree = createOrderTree<number>(emitter);

    // Test pushing items
    const item1 = tree.push(10);
    const item2 = tree.push(20);
    const item3 = tree.push(30);

    assertTreeStructure(tree, [10, 20, 30], "Push operation");
    assertEqual(emitter.events.length, 3, "Should have emitted 3 add events");

    // Test unshifting items
    const item0 = tree.unshift(5);
    assertTreeStructure(tree, [5, 10, 20, 30], "Unshift operation");
    assertEqual(emitter.events.length, 4, "Should have emitted 4 add events");

    // Test popping items
    const popped = tree.pop();
    assertEqual(popped.value, 30, "Pop should return the last item");
    assertTreeStructure(tree, [5, 10, 20], "Pop operation");
    assertEqual(emitter.events.length, 5, "Should have emitted 1 delete event");

    // Test shifting items
    const shifted = tree.shift();
    assertEqual(shifted.value, 5, "Shift should return the first item");
    assertTreeStructure(tree, [10, 20], "Shift operation");
    assertEqual(emitter.events.length, 6, "Should have emitted 1 delete event");

    // Test delete
    const deleted = tree.delete(item2);
    assertEqual(deleted, true, "Delete should return true for successful deletion");
    assertTreeStructure(tree, [10], "Delete operation");
    assertEqual(emitter.events.length, 7, "Should have emitted 1 delete event");

    // Test has
    assertEqual(tree.has(item1), true, "Tree should have item1");
    assertEqual(tree.has(item2), false, "Tree should not have deleted item2");

    console.log("Basic operations test passed!");
}

function runInsertionTest(): void
{
    console.log("\n=== Testing Insertion Operations ===");

    const emitter = new TestEventEmitter<{ event: "add" | "delete" | "move", value: OrderItem<string> }>();
    const tree = createOrderTree<string>(emitter);

    // Add initial items
    const itemA = tree.push("A");
    const itemC = tree.push("C");
    const itemE = tree.push("E");

    assertTreeStructure(tree, ["A", "C", "E"], "Initial state");

    // Test add_after
    const itemD = itemC.add_after("D");
    assertTreeStructure(tree, ["A", "C", "D", "E"], "Add_after in middle");

    const itemF = itemE.add_after("F");
    assertTreeStructure(tree, ["A", "C", "D", "E", "F"], "Add_after at end");

    // Test add_before
    const itemB = itemC.add_before("B");
    assertTreeStructure(tree, ["A", "B", "C", "D", "E", "F"], "Add_before in middle");

    const item0 = itemA.add_before("0");
    assertTreeStructure(tree, ["0", "A", "B", "C", "D", "E", "F"], "Add_before at beginning");

    // Check event emission
    assertEqual(emitter.countEvents(e => e.event === "add"), 7, "Should have emitted 7 add events");

    console.log("Insertion operations test passed!");
}

function runMovementTest(): void
{
    console.log("\n=== Testing Movement Operations ===");

    const emitter = new TestEventEmitter<{ event: "add" | "delete" | "move", value: OrderItem<number> }>();
    const tree = createOrderTree<number>(emitter);

    // Add items
    const items: OrderItem<number>[] = [];
    for (let i = 1; i <= 10; i++)
    {
        items.push(tree.push(i * 10));
    }

    assertTreeStructure(tree, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], "Initial state");
    emitter.clearEvents();

    // Test move_after
    items[0].move_after(items[5]); // Move 10 after 60
    assertTreeStructure(tree, [20, 30, 40, 50, 60, 10, 70, 80, 90, 100], "Move_after");
    assertEqual(emitter.events.length, 1, "Should have emitted 1 move event");
    emitter.clearEvents();

    // Test move_before
    items[9].move_before(items[1]); // Move 100 before 30
    assertTreeStructure(tree, [20, 100, 30, 40, 50, 60, 10, 70, 80, 90], "Move_before");
    assertEqual(emitter.events.length, 1, "Should have emitted 1 move event");
    emitter.clearEvents();

    // Test move with offset
    items[4].move(2); // Move 50 forward by 2
    assertTreeStructure(tree, [20, 100, 30, 40, 60, 10, 50, 70, 80, 90], "Move forward");

    items[7].move(-3); // Move 70 backward by 3
    assertTreeStructure(tree, [20, 100, 30, 40, 70, 60, 10, 50, 80, 90], "Move backward");

    // Test move with large offset (should cap at list boundaries)
    items[9].move(-20); // Move 90 to beginning
    assertTreeStructure(tree, [90, 20, 100, 30, 40, 70, 60, 10, 50, 80], "Move to beginning");

    items[8].move(20); // Move 50 to end
    assertTreeStructure(tree, [90, 20, 100, 30, 40, 70, 60, 10, 80, 50], "Move to end");

    // Test swap
    items[1].swap(items[6]); // Swap 20 and 60
    assertTreeStructure(tree, [90, 60, 100, 30, 40, 70, 20, 10, 80, 50], "Swap non-adjacent items");

    items[2].swap(items[3]); // Swap 100 and 30 (adjacent)
    assertTreeStructure(tree, [90, 60, 30, 100, 40, 70, 20, 10, 80, 50], "Swap adjacent items");

    console.log("Movement operations test passed!");
}

function runPositionComparisonTest(): void
{
    console.log("\n=== Testing Position Comparison Operations ===");

    const tree = createOrderTree<string>();

    // Add items
    const itemA = tree.push("A");
    const itemB = tree.push("B");
    const itemC = tree.push("C");
    const itemD = tree.push("D");
    const itemE = tree.push("E");

    // Test is_before
    assertEqual(itemA.is_before(itemC), true, "A should be before C");
    assertEqual(itemC.is_before(itemA), false, "C should not be before A");
    assertEqual(itemA.is_before(itemA), false, "A should not be before itself");
    assertEqual(itemE.is_before(itemA), false, "E should not be before A");

    // Test is_after
    assertEqual(itemC.is_after(itemA), true, "C should be after A");
    assertEqual(itemA.is_after(itemC), false, "A should not be after C");
    assertEqual(itemC.is_after(itemC), false, "C should not be after itself");
    assertEqual(itemA.is_after(itemE), false, "A should not be after E");

    // Test complex ordering
    itemC.move_after(itemE); // Reorder to: A, B, D, E, C
    assertTreeStructure(tree, ["A", "B", "D", "E", "C"], "Reordered list");

    assertEqual(itemB.is_after(itemA), true, "B should be after A");
    assertEqual(itemD.is_after(itemB), true, "D should be after B");
    assertEqual(itemC.is_after(itemE), true, "C should be after E");
    assertEqual(itemC.is_before(itemA), false, "C should not be before A");
    assertEqual(itemA.is_after(itemC), false, "A should not be after C");

    console.log("Position comparison test passed!");
}

function runEdgeCasesTest(): void
{
    console.log("\n=== Testing Edge Cases ===");

    const tree = createOrderTree<number>();

    // Test operations on empty tree
    try
    {
        tree.pop();
        console.error("FAILED: Should throw error when popping from empty tree");
    } catch (e)
    {
        console.log("PASSED: Correctly threw error when popping from empty tree");
    }

    try
    {
        tree.shift();
        console.error("FAILED: Should throw error when shifting from empty tree");
    } catch (e)
    {
        console.log("PASSED: Correctly threw error when shifting from empty tree");
    }

    // Test single item operations
    const item = tree.push(42);
    assertTreeStructure(tree, [42], "Single item tree");

    assertEqual(item.next, null, "Single item should have null next");
    assertEqual(item.prev, null, "Single item should have null prev");

    // Test operations on deleted items
    const itemToDelete = tree.push(100);
    tree.delete(itemToDelete);

    try
    {
        itemToDelete.add_after(200);
        console.error("FAILED: Should throw error when adding after deleted item");
    } catch (e)
    {
        console.log("PASSED: Correctly threw error when adding after deleted item");
    }

    try
    {
        itemToDelete.move_before(item);
        console.error("FAILED: Should throw error when moving deleted item");
    } catch (e)
    {
        console.log("PASSED: Correctly threw error when moving deleted item");
    }

    try
    {
        item.is_after(itemToDelete);
        console.error("FAILED: Should throw error when comparing with deleted item");
    } catch (e)
    {
        console.log("PASSED: Correctly threw error when comparing with deleted item");
    }

    // Test large number of insertions (for tree balancing)
    for (let i = 0; i < 100; i++)
    {
        tree.push(i);
    }

    // Check if linked list is still consistent
    let count = 0;
    let current = tree.first;
    while (current)
    {
        count++;
        current = current.next;
    }
    assertEqual(count, 101, "Should have 101 items in the tree (42 + 100 new items)");

    console.log("Edge cases test passed!");
}

function runStressTest(): void
{
    console.log("\n=== Running Stress Test ===");

    const tree = createOrderTree<number>();
    const items: OrderItem<number>[] = [];

    console.log("Adding 1000 items...");
    for (let i = 0; i < 1000; i++)
    {
        items.push(tree.push(i));
    }

    console.log("Performing 500 random operations...");
    for (let i = 0; i < 500; i++)
    {
        const operation = Math.floor(Math.random() * 5);
        const idx1 = Math.floor(Math.random() * items.length);
        const idx2 = Math.floor(Math.random() * items.length);

        try
        {
            switch (operation)
            {
                case 0: // add_after
                    if (items[idx1].parent)
                    {
                        items.push(items[idx1].add_after(1000 + i));
                    }
                    break;
                case 1: // add_before
                    if (items[idx1].parent)
                    {
                        items.push(items[idx1].add_before(2000 + i));
                    }
                    break;
                case 2: // move_after
                    if (items[idx1].parent && items[idx2].parent)
                    {
                        items[idx1].move_after(items[idx2]);
                    }
                    break;
                case 3: // move_before
                    if (items[idx1].parent && items[idx2].parent)
                    {
                        items[idx1].move_before(items[idx2]);
                    }
                    break;
                case 4: // delete
                    if (items[idx1].parent)
                    {
                        tree.delete(items[idx1]);
                    }
                    break;
            }
        } catch (e)
        {
            // Some operations might fail if items were already deleted
        }
    }

    // Verify linked list integrity
    let count = 0;
    let current = tree.first;
    let prev = null;

    while (current)
    {
        count++;
        assertEqual(current.prev, prev, "Next/prev pointer consistency check");
        prev = current;
        current = current.next;
    }

    console.log(`Final item count: ${count}`);
    console.log("Stress test completed!");
}

// Run all tests
function runAllTests(): void
{
    console.log("=== Starting OrderTree Tests ===");

    try
    {
        runBasicOperationsTest();
        runInsertionTest();
        runMovementTest();
        runPositionComparisonTest();
        runEdgeCasesTest();
        runStressTest();

        console.log("\n=== All Tests PASSED ===");
    } catch (error)
    {
        console.error("\n=== Tests FAILED ===");
        console.error(error);
    }
}

// Run the tests
runAllTests();