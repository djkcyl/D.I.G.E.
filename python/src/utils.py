prime = [
    2,
    3,
    5,
    7,
    11,
    13,
    17,
    19,
    23,
    29,
    31,
    37,
    41,
    43,
    47,
    53,
    59,
    61,
    67,
    71,
    73,
    79,
    83,
    89,
    97,
    101,
    103,
    107,
    109,
    113,
    127,
    131,
    137,
    139,
    149,
    151,
    157,
    163,
    167,
    173,
    179,
    181,
    191,
    193,
    197,
    199,
]

results = {}
for m in range(0, 10):
    for n in range(0, 10):
        p = 2**m * 3**n - 1
        if p in prime:
            results[p] = (m, n)

sorted_results = sorted(results.keys())
for p in sorted_results:
    m, n = results[p]
    print(f"2^{m}*3^{n}-1 = {p} | m+n={m + n}")
