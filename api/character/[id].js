export default async function handler(req, res) {
  const { id } = req.query;

  try {
    const response = await fetch(
      `https://character-service.dndbeyond.com/character/v5/character/${id}`
    );

    const data = await response.json();
    res.setHeader("Access-Control-Allow-Origin", "*");

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch character" });
  }
}
