import { fetchWithId, readServerResponse } from './FileLoader'

const splitAnimation = async (origin, destination, fileName, time) => {
	const encodedImageResponse = await fetchWithId('/splitAnimation',
	{
		method: 'post',
		headers: {
			'Accept': 'application/json',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			origin: encodeURIComponent(origin),
			destination: encodeURIComponent(destination),
			fileName: encodeURIComponent(fileName),
			time: time,
		})
	})
	const data = await readServerResponse(encodedImageResponse)
	return data.totalSegments
}

export {
 splitAnimation
}
