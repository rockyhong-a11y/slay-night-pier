"""Sixteen iconic paired wrestling techniques, authored in body-height units.

Each row has thirteen independent keys. Standing, kneeling, horizontal and
curled artwork all retains one physical body scale; angles never hide a pose
substitution by squashing the fighter. Contact controls follow anatomical
headlock, shoulder, wrist, knee and scissors locations, rather than midpoints.
"""
from math import pi

TIMES=[0,.06,.12,.20,.29,.38,.47,.56,.65,.73,.82,.91,1]

def author_techniques(state):
 clips={}
 def add(id,name,family,duration,h,v,hp,vp,feature,anchor,impact=.65,surface='ground',height=0):
  hero,side,direction=id.split('_');hposes=hp.split();vposes=vp.split()
  assert len(h)==len(v)==len(hposes)==len(vposes)==len(TIMES)
  hs=[state(*point,pose) for point,pose in zip(h,hposes)]
  vs=[state(*point,pose) for point,pose in zip(v,vposes)]
  for value in hs:value['relativeFacing']=1
  for value in vs:value['relativeFacing']=-1 if side=='front' else 1
  # The keyed local grip control tracks the specific painted anatomical hold.
  # Approach and release gently move the control from/to the hands' rest zone.
  locals=[]
  for t in TIMES:
   blend=min(1,t/.20) if t<.20 else max(0,(.91-t)/.18) if t>.73 else 1
   locals.append((anchor[0]*blend,anchor[1]*blend))
  clips[id]={'name':name,'family':family,'heroId':hero,'type':'grapple','direction':side,'inputDirection':direction,'duration':duration,'contactAt':.12,'impactAt':impact,'recoveryAt':.82,'recovery':.18,'times':TIMES,'hero':hs,'victim':vs,'gripFeature':feature,'gripType':feature,'gripLocal':locals,'gripPeriods':[[.12,.56 if family!='cradle' else .73]],'impactSurface':surface,'impactHeight':height,'impactLocal':(.23,-.23) if family=='backbreaker' else (0,-.34) if family=='cradle' else None,'events':[{'at':.12,'type':'grip'},{'at':.38,'type':'technique'},{'at':impact,'type':'impact'},{'at':.73,'type':'release'}]}

 add('atlas_front_up','파워밤','powerbomb',1.52,
  [(0,0,0),(.01,-.01,0),(.02,-.04,-.03),(.02,-.07,-.05),(.03,.01,-.02),(.04,.07,0),(.05,.08,0),(.07,.03,.03),(.07,0,0),(.05,0,0),(.03,0,0),(.01,0,0),(0,0,0)],
  [(.52,0,0),(.47,0,0),(.34,.04,.12),(.19,.20,.8),(.09,.48,2.5),(.08,.76,pi),(.12,.75,pi),(.40,.38,4.0),(.83,0,0),(.90,0,0),(.96,0,0),(.99,0,0),(1,0,0)],
  'clinch clinch underhook underhook powerbombHold powerbombHold powerbombHold spinebusterDrive powerbombSit powerbombSit powerbombSit underhook idle',
  'idle idle folded folded shoulderFold hurt hurt shoulderFold supine supine supine supine supine','waist',(.08,.35))

 add('atlas_front_down','DDT','ddt',1.22,
  [(0,0,0),(0,-.01,0),(-.01,-.03,0),(-.02,-.02,-.03),(-.04,-.02,-.05),(-.08,.02,-.08),(-.14,.03,-.13),(-.22,.01,-.08),(-.25,0,0),(-.22,0,0),(-.13,0,0),(-.04,0,0),(0,0,0)],
  [(.52,0,0),(.46,0,0),(.36,0,-.05),(.32,.015,-.10),(.29,.025,-.13),(.27,.07,-.18),(.28,.12,-.27),(.36,.08,-.35),(.45,0,0),(.49,0,0),(.52,0,0),(.54,0,0),(.55,0,0)],
  'clinch clinch ddtHeadlock ddtHeadlock ddtHeadlock ddtHeadlock ddtFall ddtFall ddtFall ddtFall ddtFall underhook idle',
  'idle idle folded folded folded folded folded shoulderFold prone prone prone prone prone','frontFacelock',(.12,.01))

 add('atlas_front_left','백브레이커','backbreaker',1.45,
  [(0,0,0),(.01,-.01,0),(.02,-.03,-.02),(.03,-.035,-.02),(.04,-.01,0),(.045,0,0),(.05,0,0),(.05,-.01,0),(.04,0,0),(.035,0,0),(.02,0,0),(.01,0,0),(0,0,0)],
  [(.52,0,0),(.47,0,0),(.39,.025,-.05),(.28,.15,.25),(.24,.24,.08),(.26,.20,.04),(.28,.10,0),(.30,.10,0),(.43,.07,.02),(.66,0,0),(.76,0,0),(.80,0,0),(.82,0,0)],
  'clinch clinch underhook underhook backbreakerKnee backbreakerKnee backbreakerPress backbreakerPress backbreakerPress spinebusterLand spinebusterLand underhook idle',
  'idle idle hurt folded supine supine supine supine supine supine supine supine supine','raisedKnee',(.23,-.23),impact=.47,surface='body',height=.27)

 add('atlas_front_right','스파인버스터','spinebuster',1.14,
  [(0,0,0),(.01,-.01,0),(.025,-.025,-.015),(.06,-.035,-.025),(.11,0,.02),(.19,.065,.03),(.26,.085,.04),(.31,.055,.05),(.34,0,0),(.29,0,0),(.18,0,0),(.06,0,0),(0,0,0)],
  [(.52,0,0),(.47,0,0),(.39,.01,0),(.34,.12,-.12),(.44,.24,-.25),(.58,.32,-.42),(.71,.31,-.65),(.83,.17,-.28),(.97,0,0),(1.02,0,0),(1.06,0,0),(1.08,0,0),(1.1,0,0)],
  'clinch clinch spinebusterDrive spinebusterDrive spinebusterDrive spinebusterDrive spinebusterDrive spinebusterLand spinebusterLand spinebusterLand spinebusterLand underhook idle',
  'idle idle folded folded folded backbend backbend supine supine supine supine supine supine','waist',(.24,-.08))

 add('atlas_rear_up','저먼 스플렉스','germanSuplex',1.39,
  [(0,0,0),(0,-.015,0),(-.01,-.03,-.02),(-.015,-.04,-.03),(-.03,-.01,-.05),(-.07,.04,-.08),(-.12,.035,-.07),(-.17,.02,-.035),(-.22,0,0),(-.20,0,0),(-.12,0,0),(-.04,0,0),(0,0,0)],
  [(.43,0,0),(.39,0,0),(.31,.03,-.04),(.17,.16,-.15),(.03,.37,-.33),(-.16,.54,-.52),(-.41,.48,-.80),(-.65,.23,-.98),(-.84,0,0),(-.89,0,0),(-.94,0,0),(-.97,0,0),(-.98,0,0)],
  'clinch clinch underhook underhook germanBridge germanBridge germanBridge germanBridge germanRelease germanRelease germanRelease underhook idle',
  'rearFacing rearFacing folded folded shoulderFold shoulderFold shoulderFold backbend supine supine supine supine supine','rearWaist',(.15,.25))

 add('atlas_rear_down','리버스 DDT','reverseDdt',1.20,
  [(0,0,0),(0,-.01,0),(-.005,-.02,0),(-.015,-.01,-.025),(-.04,.005,-.04),(-.07,.035,-.06),(-.13,.04,-.08),(-.20,.01,-.04),(-.24,0,0),(-.21,0,0),(-.12,0,0),(-.04,0,0),(0,0,0)],
  [(.43,0,0),(.38,0,0),(.30,0,-.05),(.24,.015,-.15),(.22,.04,-.24),(.22,.075,-.35),(.23,.09,-.48),(.32,.06,-.25),(.43,0,0),(.49,0,0),(.53,0,0),(.55,0,0),(.56,0,0)],
  'clinch clinch reverseHeadlock reverseHeadlock reverseHeadlock reverseHeadlock reverseHeadlock reverseDdtFall reverseDdtFall reverseDdtFall reverseDdtFall underhook idle',
  'rearFacing rearFacing backbend backbend backbend backbend backbend supine supine supine supine supine supine','invertedFacelock',(-.12,.12))

 add('atlas_rear_left','러시안 레그 스윕','legSweep',1.16,
  [(0,0,0),(.01,-.01,0),(.02,-.02,0),(.035,-.015,-.015),(.04,-.01,-.025),(.025,.035,-.03),(-.01,.075,-.035),(-.04,.035,-.02),(-.07,0,0),(-.05,0,0),(-.025,0,0),(-.01,0,0),(0,0,0)],
  [(.43,0,0),(.39,0,0),(.34,0,0),(.32,.01,.02),(.31,.02,.04),(.29,.035,.07),(.23,.07,.12),(.18,.03,.10),(.19,0,0),(.24,0,0),(.31,0,0),(.35,0,0),(.37,0,0)],
  'clinch clinch sweepHook sweepHook sweepHook sweepHook sweepFall sweepFall sweepFall sweepFall sweepFall underhook idle',
  'rearFacing rearFacing hurt hurt hurt hurt backbend supine supine supine supine supine supine','shoulderAndAnkle',(-.12,.20))

 add('atlas_rear_right','불독','bulldog',1.32,
  [(0,0,0),(.01,-.01,0),(.03,-.02,0),(.08,-.015,0),(.18,.025,.02),(.34,.12,.03),(.52,.22,.05),(.65,.14,.03),(.70,0,0),(.70,0,0),(.70,0,0),(.70,0,0),(.70,0,0)],
  [(.43,0,0),(.40,0,0),(.37,0,-.02),(.43,.015,-.04),(.58,.07,-.05),(.75,.16,-.08),(.91,.22,-.12),(1.07,.13,-.08),(1.21,0,0),(1.29,0,0),(1.34,0,0),(1.37,0,0),(1.38,0,0)],
  'clinch clinch ddtHeadlock ddtHeadlock bulldogDive bulldogDive bulldogDive bulldogLand bulldogLand bulldogLand bulldogLand underhook idle',
  'rearFacing rearFacing folded folded folded kneeling kneeling folded prone prone prone prone prone','runningHeadlock',(.20,-.06))

 add('nova_front_up','버티컬 스플렉스','verticalSuplex',1.56,
  [(0,0,0),(0,-.01,0),(.01,-.03,-.02),(.02,-.05,-.02),(.015,-.01,-.03),(0,.04,-.04),(-.04,.07,-.06),(-.12,.035,-.075),(-.24,0,0),(-.22,0,0),(-.13,0,0),(-.04,0,0),(0,0,0)],
  [(.52,0,0),(.47,0,0),(.34,.025,.1),(.21,.22,.9),(.10,.57,2.7),(.03,.80,pi),(-.09,.79,pi),(-.39,.39,3.6),(-.77,0,0),(-.85,0,0),(-.91,0,0),(-.94,0,0),(-.96,0,0)],
  'clinch clinch underhook underhook verticalHold verticalHold verticalHold throwArc verticalRelease verticalRelease verticalRelease underhook idle',
  'idle idle folded folded shoulderFold hurt hurt shoulderFold supine supine supine supine supine','shoulderAndWaist',(.10,.30))

 add('nova_front_down','스냅메어','snapmare',1.16,
  [(0,0,0),(0,-.01,0),(.01,-.03,0),(.02,-.035,-.03),(.02,-.02,-.06),(.015,.02,-.08),(.01,.025,-.05),(.025,.01,-.02),(.035,0,0),(.035,0,0),(.025,0,0),(.01,0,0),(0,0,0)],
  [(.52,0,0),(.46,0,0),(.32,.015,-.03),(.16,.15,-.32),(.04,.34,-.70),(.09,.49,-1.02),(.32,.36,-1.35),(.62,.16,-.50),(.91,0,0),(.98,0,0),(1.02,0,0),(1.04,0,0),(1.05,0,0)],
  'clinch clinch snapmareShoulder snapmareShoulder snapmareShoulder snapmareShoulder snapmareFinish snapmareFinish snapmareFinish snapmareFinish snapmareFinish underhook idle',
  'idle idle folded folded shoulderFold shoulderFold tuck tuck seated seated seated seated seated','overShoulderHeadlock',(.10,.04))

 add('nova_front_left','암드래그','armDrag',1.10,
  [(0,0,0),(-.01,-.01,0),(-.02,-.025,-.02),(-.025,-.035,-.04),(-.03,-.02,-.06),(-.025,.01,-.05),(-.01,.015,-.03),(.01,.005,-.01),(.025,0,0),(.025,0,0),(.015,0,0),(.005,0,0),(0,0,0)],
  [(.52,0,0),(.45,0,0),(.33,.02,-.04),(.22,.16,-.25),(.22,.35,-.52),(.39,.46,-.84),(.64,.27,-.66),(.88,.09,-.25),(1.08,0,0),(1.15,0,0),(1.18,0,0),(1.20,0,0),(1.21,0,0)],
  'clinch clinch armDragPivot armDragPivot armDragPivot armDragPull armDragPull armDragPull armDragPull armDragPull armDragPull underhook idle',
  'idle idle hurt folded shoulderFold tuck tuck supine supine supine supine supine supine','wristAndArm',(-.12,-.10))

 add('nova_front_right','허리케인라나','hurricanrana',1.48,
  [(0,0,0),(.01,-.025,0),(.03,-.055,-.025),(.11,.11,-.04),(.20,.38,-.04),(.29,.61,-.06),(.34,.51,.05),(.39,.23,.10),(.49,.01,.02),(.53,0,0),(.53,0,0),(.53,0,0),(.53,0,0)],
  [(.52,0,0),(.50,0,0),(.48,.01,0),(.46,.025,-.01),(.43,.075,-.05),(.45,.09,-.16),(.58,.20,-.45),(.79,.19,-.94),(1.01,.025,-.10),(1.15,0,0),(1.23,0,0),(1.27,0,0),(1.29,0,0)],
  'clinch underhook underhook scissorsJump scissorsJump scissorsJump scissorsHandstand scissorsHandstand scissorsFinish scissorsFinish scissorsFinish underhook idle',
  'idle idle hurt hurt hurt folded shoulderFold shoulderFold tuck supine supine supine supine','headScissors',(.07,-.10))

 add('nova_rear_up','드래곤 스플렉스','dragonSuplex',1.53,
  [(0,0,0),(0,-.01,0),(-.005,-.025,-.015),(-.01,-.04,-.025),(-.04,-.01,-.04),(-.08,.05,-.06),(-.14,.065,-.04),(-.21,.03,-.02),(-.27,0,0),(-.23,0,0),(-.14,0,0),(-.04,0,0),(0,0,0)],
  [(.43,0,0),(.39,0,0),(.31,.02,0),(.18,.15,-.10),(.03,.40,-.28),(-.17,.66,-.48),(-.44,.59,-.74),(-.70,.28,-.95),(-.91,0,0),(-.96,0,0),(-1,0,0),(-1.02,0,0),(-1.03,0,0)],
  'clinch clinch underhook underhook dragonBridge dragonBridge dragonBridge dragonBridge verticalRelease verticalRelease verticalRelease underhook idle',
  'rearFacing rearFacing hurt hurt shoulderFold shoulderFold shoulderFold backbend supine supine supine supine supine','fullNelson',(.12,.28))

 add('nova_rear_down','백 스플렉스','backSuplex',1.31,
  [(0,0,0),(0,-.01,0),(-.005,-.03,-.015),(-.01,-.035,-.025),(-.03,-.01,-.04),(-.07,.035,-.06),(-.12,.04,-.07),(-.19,.025,-.04),(-.25,0,0),(-.22,0,0),(-.13,0,0),(-.04,0,0),(0,0,0)],
  [(.43,0,0),(.38,0,0),(.29,.02,-.03),(.15,.14,-.12),(0,.31,-.25),(-.18,.45,-.44),(-.42,.39,-.65),(-.65,.18,-.73),(-.83,0,0),(-.89,0,0),(-.92,0,0),(-.95,0,0),(-.96,0,0)],
  'clinch clinch underhook underhook backSuplexArch backSuplexArch backSuplexArch backSuplexLand backSuplexLand backSuplexLand backSuplexLand underhook idle',
  'rearFacing rearFacing folded folded folded backbend backbend supine supine supine supine supine supine','backAndThigh',(.05,.04))

 add('nova_rear_left','넥브레이커','neckbreaker',1.18,
  [(0,0,0),(0,-.01,0),(.005,-.02,0),(.01,-.015,-.015),(.005,.005,-.025),(-.015,.025,-.035),(-.055,.035,-.045),(-.10,.015,-.025),(-.14,0,0),(-.12,0,0),(-.065,0,0),(-.02,0,0),(0,0,0)],
  [(.43,0,0),(.39,0,0),(.33,.015,-.02),(.31,.03,-.08),(.29,.035,-.15),(.25,.045,-.22),(.18,.055,-.32),(.12,.035,-.19),(.12,0,0),(.19,0,0),(.28,0,0),(.33,0,0),(.35,0,0)],
  'clinch clinch neckbreakerTwist neckbreakerTwist neckbreakerTwist neckbreakerTwist neckbreakerFall neckbreakerFall neckbreakerFall neckbreakerFall neckbreakerFall underhook idle',
  'rearFacing rearFacing backbend backbend backbend backbend backbend supine supine supine supine supine supine','backToBackNeck',(-.12,.12))

 add('nova_rear_right','롤링 크레이들','cradle',1.60,
  [(0,0,0),(.01,-.01,0),(.02,-.025,-.01),(.02,-.01,-.03),(.10,.015,-.30),(.35,.035,-1.2),(.75,.025,-2.7),(1.2,.015,-4.4),(1.45,.01,-6.0),(1.5,0,-2*pi),(1.5,0,-2*pi),(1.5,0,-2*pi),(1.5,0,-2*pi)],
  [(.43,0,0),(.39,0,0),(.32,.02,-.02),(.23,.10,-.15),(.20,.13,-.40),(.45,.15,-1.3),(.90,.13,-2.8),(1.33,.09,-4.5),(1.55,.04,-6.1),(1.72,0,-2*pi),(1.92,0,-2*pi),(2.02,0,-2*pi),(2.05,0,-2*pi)],
  'clinch clinch cradleTuck cradleTuck cradleTuck cradleRoll cradleRoll cradleRoll cradleRoll cradleTuck cradleTuck underhook idle',
  'rearFacing rearFacing kneeling folded tuck tuck tuck tuck tuck tuck supine supine supine','cradleLegHook',(.03,-.25),impact=.73,surface='body',height=.16)
 return clips
