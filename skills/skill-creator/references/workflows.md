# Workflow Patterns

Design patterns for multi-step skill workflows.

## Sequential Workflow

For linear processes where each step depends on the previous:

```markdown
## Workflow

1. **Gather** - Collect required information
   - Inputs: User request, context
   - Output: Requirements list
   - Validation: All requirements identified

2. **Plan** - Design approach
   - Inputs: Requirements from step 1
   - Output: Implementation plan
   - Validation: Plan covers all requirements

3. **Execute** - Implement the plan
   - Inputs: Plan from step 2
   - Output: Completed work
   - Validation: Meets original requirements
```

## Conditional Workflow

For branching logic based on inputs or results:

```markdown
## Workflow

1. **Analyze** - Determine the type of request
   - If type A: proceed to step 2a
   - If type B: proceed to step 2b
   - If unclear: ask for clarification

2a. **Handle Type A**
   - Specific steps for type A
   - Output: Type A result

2b. **Handle Type B**
   - Specific steps for type B
   - Output: Type B result

3. **Finalize** - Common completion steps
```

## Iterative Workflow

For tasks requiring refinement:

```markdown
## Workflow

1. **Initial Pass** - Create first version
   - Output: Draft result

2. **Review** - Evaluate against criteria
   - Check: Criterion 1
   - Check: Criterion 2
   - If all pass: proceed to step 4
   - If any fail: proceed to step 3

3. **Refine** - Address issues
   - Fix identified problems
   - Return to step 2

4. **Finalize** - Complete the task
```

## Parallel Workflow

For independent subtasks that can be combined:

```markdown
## Workflow

1. **Decompose** - Split into independent parts
   - Identify: Part A, Part B, Part C
   - Verify: Parts are independent

2. **Process** - Handle each part
   - Process Part A
   - Process Part B
   - Process Part C

3. **Combine** - Merge results
   - Integrate outputs
   - Resolve conflicts
   - Output: Combined result
```

## Error Handling

Include explicit error handling in workflows:

```markdown
## Error Handling

- **Missing input**: Ask user for clarification
- **Ambiguous request**: Present options, ask user to choose
- **External failure**: Report error, suggest alternatives
- **Partial success**: Complete what's possible, report failures
```

## State Tracking

For complex workflows, track state explicitly:

```markdown
## State

Track the following throughout execution:
- Current step
- Completed outputs
- Pending items
- Encountered issues

Report state when:
- Asking for user input
- Encountering errors
- Completing major milestones
```
