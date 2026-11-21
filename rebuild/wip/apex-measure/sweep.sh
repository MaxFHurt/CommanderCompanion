set -x
cd /tmp/claude-0/-home-user/7adea7a4-48ed-5502-b75d-2512a9edfc32/scratchpad/apex/runs/w/proto/tests
node /tmp/claude-0/-home-user/7adea7a4-48ed-5502-b75d-2512a9edfc32/scratchpad/apex/measure.js ../candidate own /tmp/claude-0/-home-user/7adea7a4-48ed-5502-b75d-2512a9edfc32/scratchpad/apex/sweep/own.json 2>/tmp/claude-0/-home-user/7adea7a4-48ed-5502-b75d-2512a9edfc32/scratchpad/apex/sweep/own.log
for w in 1 0.75 0.5 0.25 0; do p=$(node -e "console.log(+(1-$w).toFixed(2))")
  UP="{\"strPopW\":$p}" node /tmp/claude-0/-home-user/7adea7a4-48ed-5502-b75d-2512a9edfc32/scratchpad/apex/measure.js ../candidate precon /tmp/claude-0/-home-user/7adea7a4-48ed-5502-b75d-2512a9edfc32/scratchpad/apex/sweep/pre-w$w.json 2>/tmp/claude-0/-home-user/7adea7a4-48ed-5502-b75d-2512a9edfc32/scratchpad/apex/sweep/pre-w$w.log
  UP="{\"strPopW\":$p}" node /tmp/claude-0/-home-user/7adea7a4-48ed-5502-b75d-2512a9edfc32/scratchpad/apex/measure.js ../candidate gen /tmp/claude-0/-home-user/7adea7a4-48ed-5502-b75d-2512a9edfc32/scratchpad/apex/sweep/gen-w$w.json /tmp/claude-0/-home-user/7adea7a4-48ed-5502-b75d-2512a9edfc32/scratchpad/apex/gendecks.json 2>/tmp/claude-0/-home-user/7adea7a4-48ed-5502-b75d-2512a9edfc32/scratchpad/apex/sweep/gen-w$w.log
  for s in test tuneall; do for t in apex mid budget; do echo "w$w $s $t: $(UP="{\"strPopW\":$p}" SCORECHECK=1 TIER=$t node bench.js ../candidate xw $s --quiet 2>&1 | grep '^MEAN' | sed 's/ | whole-list.*//' | tr '\n' ' ')" >> /tmp/claude-0/-home-user/7adea7a4-48ed-5502-b75d-2512a9edfc32/scratchpad/apex/sweep/bench.txt; done; done
done
node /tmp/claude-0/-home-user/7adea7a4-48ed-5502-b75d-2512a9edfc32/scratchpad/apex/strong.js ../candidate /tmp/claude-0/-home-user/7adea7a4-48ed-5502-b75d-2512a9edfc32/scratchpad/apex/sweep/strong.json 2>/tmp/claude-0/-home-user/7adea7a4-48ed-5502-b75d-2512a9edfc32/scratchpad/apex/sweep/strong.log
echo done > /tmp/claude-0/-home-user/7adea7a4-48ed-5502-b75d-2512a9edfc32/scratchpad/apex/sweep/done
