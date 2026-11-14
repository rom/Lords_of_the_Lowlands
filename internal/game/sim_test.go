package game

import "testing"

func TestAIvsAISim(t *testing.T) {
	lv := &Level{Name: "t", Theme: "temperate", Width: 72, Height: 72, StartAge: 0, MaxAge: 6, MaxPlayers: 4, Gen: &GenParams{Seed: 7, Forest: 0.5, Animals: 0.5, Water: 0.3, Mountains: 0.3}}
	if err := lv.Validate(); err != nil {
		t.Fatal(err)
	}
	g, err := NewGame(lv, []PlayerSetup{{Name: "A", Team: 0, AI: true, Difficulty: "hard"}, {Name: "B", Team: 1, AI: true, Difficulty: "normal"}}, 1)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 10*60*25 && !g.Over; i++ {
		g.Step()
		g.Events()
		if i%(10*60*2) == 0 {
			for _, p := range g.Players {
				t.Logf("t=%dm p%d age=%d pop=%d/%d res=%v techs=%d kills=%d", i/600, p.Index, p.Age, p.Pop, p.PopCap, p.Res, p.TechCount, p.Kills)
			}
		}
	}
	t.Logf("over=%v winner=%d results=%+v", g.Over, g.Winner, g.Results())
}
