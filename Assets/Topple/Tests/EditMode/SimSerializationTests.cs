// GDD §15.5 EditMode: serialização do layout e ida/volta da gravação.
// (Ida/volta das mensagens Mirror via fio entra na T6 com a autoridade do servidor.)
using NUnit.Framework;
using UnityEngine;
using Topple.Sim;

namespace Topple.Tests
{
    public class SimSerializationTests
    {
        [Test] public void Layout_JsonRoundtrip()
        {
            var spec = new LayoutSpec
            {
                Placements = new[]
                {
                    new LayoutPlacement { InstanceId = 1, Piece = "Common", Gx = 4, Gz = 8, Rot = 6 },
                    new LayoutPlacement { InstanceId = 2, Piece = "Heavy", Gx = -3, Gz = 0, Rot = 23 },
                }
            };
            var back = LayoutSpec.FromJson(spec.ToJson());
            Assert.AreEqual(2, back.Placements.Length);
            Assert.AreEqual("Common", back.Placements[0].Piece);
            Assert.AreEqual(4, back.Placements[0].Gx);
            Assert.AreEqual(23, back.Placements[1].Rot);
        }

        [Test] public void Recording_BinaryRoundtripKeepsMillimeterPrecision()
        {
            var rec = new SimRecording
            {
                Header = new SimHeader { Version = 1, Seed = 42, StepHz = 60f, FrameCount = 1 },
                Events = new[] { new SimEvent(1.25f, "knock", 7, 0) },
                Frames = new[]
                {
                    new SimFrame { Step = 30, Samples = new System.Collections.Generic.List<SimSample>
                    {
                        new SimSample(3, new Vector3(1.234f, 0.5f, -2.001f), Quaternion.Euler(0, 33, 0)),
                    } },
                }
            };
            var back = SimSerializer.Load(SimSerializer.Save(rec));
            Assert.AreEqual((uint)42, back.Header.Seed);
            Assert.AreEqual(1, back.Events.Length);
            Assert.AreEqual("knock", back.Events[0].Kind);
            Assert.AreEqual(1, back.Frames.Length);
            var s = back.Frames[0].Samples[0];
            Assert.AreEqual(3, s.Id);
            Assert.That((s.Pos - new Vector3(1.234f, 0.5f, -2.001f)).magnitude, Is.LessThan(0.002f));
            Assert.That(Quaternion.Angle(s.Rot, Quaternion.Euler(0, 33, 0)), Is.LessThan(1f));
        }

        [Test] public void Recording_FramesSortedById()
        {
            var rec = new SimRecording
            {
                Header = new SimHeader { Version = 1, Seed = 1, StepHz = 60f },
                Frames = new[]
                {
                    new SimFrame { Step = 2, Samples = new System.Collections.Generic.List<SimSample>
                    {
                        new SimSample(9, Vector3.zero, Quaternion.identity),
                        new SimSample(2, Vector3.one, Quaternion.identity),
                    } },
                }
            };
            var back = SimSerializer.Load(SimSerializer.Save(rec));
            Assert.AreEqual(2, back.Frames[0].Samples[0].Id);
            Assert.AreEqual(9, back.Frames[0].Samples[1].Id);
        }
    }
}
